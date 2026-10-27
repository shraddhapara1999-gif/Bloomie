-- Bloomie core schema
-- All timestamps are timestamptz (stored in UTC). Local calendar dates
-- (entry_date / displayed_on) are computed client-side from the user's timezone.

create extension if not exists pgcrypto with schema extensions;

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admins are identified by app_metadata.role = 'admin'. app_metadata can only
-- be written with the service-role key, so users cannot grant themselves this.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- ─── profiles ───────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  onboarding_preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(onboarding_preferences) = 'object'),
  onboarding_completed_at timestamptz,
  -- Notifications
  email_notifications boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  -- Optional AI features are off until the user explicitly opts in.
  ai_opt_in boolean not null default false,
  ai_opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''), 80),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── mood_entries ───────────────────────────────────────────────────────────

create table public.mood_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mood_score smallint not null check (mood_score between 1 and 5),
  emotion_tags text[] not null default '{}' check (cardinality(emotion_tags) <= 12),
  energy_level smallint check (energy_level between 1 and 5),
  focus_level smallint check (focus_level between 1 and 5),
  stress_level smallint check (stress_level between 1 and 5),
  sleep_quality smallint check (sleep_quality between 1 and 5),
  -- Optional cycle / body signals; only stored if the user chooses to track them.
  body_signals jsonb check (body_signals is null or jsonb_typeof(body_signals) = 'object'),
  habits jsonb check (habits is null or jsonb_typeof(habits) = 'object'),
  optional_note text check (char_length(optional_note) <= 2000),
  entry_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index mood_entries_user_date_idx on public.mood_entries (user_id, entry_date desc, created_at desc);

-- ─── journal_entries ────────────────────────────────────────────────────────

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  content text not null check (char_length(content) between 1 and 20000),
  entry_type text not null default 'daily'
    check (entry_type in ('daily', 'gratitude', 'mood', 'stressor', 'reflection')),
  prompt text check (char_length(prompt) <= 300),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  optional_mood_entry_id uuid,
  entry_date date not null default (now() at time zone 'utc')::date,
  search tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A journal entry can only link to a mood entry owned by the same user.
  foreign key (optional_mood_entry_id, user_id)
    references public.mood_entries (id, user_id)
    on delete set null (optional_mood_entry_id)
);

create trigger journal_entries_updated_at before update on public.journal_entries
  for each row execute function public.set_updated_at();

create index journal_entries_user_date_idx on public.journal_entries (user_id, entry_date desc, created_at desc);
create index journal_entries_search_idx on public.journal_entries using gin (search);
create index journal_entries_mood_idx on public.journal_entries (optional_mood_entry_id) where optional_mood_entry_id is not null;

-- ─── Content: meditation_sessions, exercises, affirmations ─────────────────

create table public.meditation_sessions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(title) <= 120),
  description text not null default '',
  category text not null check (category in
    ('breathing', 'mindfulness', 'sleep', 'stress', 'focus', 'gratitude', 'body', 'beginner')),
  duration_seconds integer not null check (duration_seconds between 30 and 7200),
  audio_url text,
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  -- Optional breathing pacing, e.g. {"inhale":4,"hold":0,"exhale":6,"hold_after":0}
  breathing_pattern jsonb,
  -- Timed guidance cues: [{"at": 0, "text": "..."}]
  guidance jsonb not null default '[]'::jsonb check (jsonb_typeof(guidance) = 'array'),
  tags text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger meditation_sessions_updated_at before update on public.meditation_sessions
  for each row execute function public.set_updated_at();
create index meditation_sessions_published_idx on public.meditation_sessions (category, duration_seconds) where is_published;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(title) <= 120),
  description text not null default '',
  purpose text not null default '',
  category text not null check (category in
    ('breathing', 'grounding', 'body', 'gratitude', 'reflection', 'relaxation', 'mindfulness', 'sleep')),
  duration_seconds integer not null check (duration_seconds between 30 and 7200),
  -- Steps: [{"title": "...", "text": "...", "seconds": 30, "breathing": {...}?}]
  instructions jsonb not null default '[]'::jsonb check (jsonb_typeof(instructions) = 'array'),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();

create table public.affirmations (
  id uuid primary key default gen_random_uuid(),
  text text not null unique check (char_length(text) <= 300),
  category text not null default 'general',
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── meditation_history / exercise_history ─────────────────────────────────

create table public.meditation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.meditation_sessions (id) on delete restrict,
  duration_completed_seconds integer not null default 0 check (duration_completed_seconds between 0 and 14400),
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (completed = false or completed_at is not null)
);

create index meditation_history_user_idx on public.meditation_history (user_id, started_at desc);

create table public.exercise_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  completed boolean not null default false,
  stopped_early boolean not null default false,
  reflection text check (char_length(reflection) <= 2000),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index exercise_history_user_idx on public.exercise_history (user_id, started_at desc);

-- ─── reminders ──────────────────────────────────────────────────────────────

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('meditation', 'journal', 'mood_checkin', 'custom')),
  label text not null default '' check (char_length(label) <= 80),
  scheduled_time time not null,
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  notification_channel text not null default 'browser' check (notification_channel in ('browser', 'email', 'push')),
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reminders_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();
create index reminders_user_idx on public.reminders (user_id);
create index reminders_enabled_idx on public.reminders (scheduled_time) where enabled;

-- Delivery log written by the server-side scheduler. Users can read their own.
create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  detail text check (char_length(detail) <= 300),
  scheduled_for timestamptz not null,
  created_at timestamptz not null default now(),
  unique (reminder_id, scheduled_for)
);

create index reminder_deliveries_user_idx on public.reminder_deliveries (user_id, created_at desc);

-- Web push subscriptions (one per browser/device).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ─── user_favorites ─────────────────────────────────────────────────────────

create table public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_type text not null check (content_type in ('meditation', 'exercise', 'affirmation')),
  content_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, content_type, content_id)
);

-- ─── affirmation_history ────────────────────────────────────────────────────

create table public.affirmation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  affirmation_id uuid not null references public.affirmations (id) on delete cascade,
  displayed_on date not null,
  displayed_at timestamptz not null default now(),
  unique (user_id, displayed_on)
);

-- Returns today's affirmation for the calling user, choosing one the first
-- time it is requested on a given local date and returning the same one after.
create or replace function public.get_daily_affirmation(p_local_date date)
returns table (id uuid, text text, category text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select h.affirmation_id into v_aff
  from public.affirmation_history h
  where h.user_id = v_uid and h.displayed_on = p_local_date;

  if v_aff is null then
    -- Prefer affirmations the user has not seen in the last 30 days.
    select a.id into v_aff
    from public.affirmations a
    where a.is_published
      and a.id not in (
        select h.affirmation_id from public.affirmation_history h
        where h.user_id = v_uid and h.displayed_on > p_local_date - 30
      )
    order by random()
    limit 1;

    if v_aff is null then
      select a.id into v_aff from public.affirmations a where a.is_published order by random() limit 1;
    end if;

    if v_aff is null then
      return;
    end if;

    insert into public.affirmation_history (user_id, affirmation_id, displayed_on)
    values (v_uid, v_aff, p_local_date)
    on conflict (user_id, displayed_on) do nothing;

    select h.affirmation_id into v_aff
    from public.affirmation_history h
    where h.user_id = v_uid and h.displayed_on = p_local_date;
  end if;

  return query
    select a.id, a.text, a.category from public.affirmations a where a.id = v_aff;
end;
$$;

-- ─── Client error log (no journal text or mood data; insert-only) ───────────

create table public.client_error_logs (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  message text not null check (char_length(message) <= 500),
  route text check (char_length(route) <= 200),
  release text check (char_length(release) <= 40),
  created_at timestamptz not null default now()
);
