-- Row Level Security: every user-owned table is restricted to its owner.
-- Content tables are readable when published; only admins may write them.

alter table public.profiles              enable row level security;
alter table public.mood_entries          enable row level security;
alter table public.journal_entries       enable row level security;
alter table public.meditation_sessions   enable row level security;
alter table public.exercises             enable row level security;
alter table public.affirmations          enable row level security;
alter table public.meditation_history    enable row level security;
alter table public.exercise_history      enable row level security;
alter table public.reminders             enable row level security;
alter table public.reminder_deliveries   enable row level security;
alter table public.push_subscriptions    enable row level security;
alter table public.user_favorites        enable row level security;
alter table public.affirmation_history   enable row level security;
alter table public.client_error_logs     enable row level security;

-- ─── profiles: own row only; rows are created by the signup trigger ─────────

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ─── Fully owner-scoped tables ──────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'mood_entries', 'journal_entries', 'meditation_history', 'exercise_history',
    'reminders', 'push_subscriptions', 'user_favorites'
  ] loop
    execute format(
      'create policy "%1$s: read own" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: insert own" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: update own" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: delete own" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- History rows must reference content the user is allowed to see.
create policy "meditation_history: session visible" on public.meditation_history
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.meditation_sessions s where s.id = session_id and s.is_published));
create policy "exercise_history: exercise visible" on public.exercise_history
  as restrictive for insert to authenticated
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and e.is_published));

-- ─── affirmation_history: read/insert own (rows are append-only for users) ──

create policy "affirmation_history: read own" on public.affirmation_history
  for select to authenticated using (user_id = (select auth.uid()));
create policy "affirmation_history: insert own" on public.affirmation_history
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "affirmation_history: delete own" on public.affirmation_history
  for delete to authenticated using (user_id = (select auth.uid()));

-- ─── reminder_deliveries: written by the service role; users read their own ─

create policy "reminder_deliveries: read own" on public.reminder_deliveries
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── client_error_logs: users may insert their own; nobody reads via API ────

create policy "client_error_logs: insert" on public.client_error_logs
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ─── Content tables ─────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['meditation_sessions', 'exercises', 'affirmations'] loop
    execute format(
      'create policy "%1$s: read published" on public.%1$I for select to anon, authenticated using (is_published or (select public.is_admin()))', t);
    execute format(
      'create policy "%1$s: admin insert" on public.%1$I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format(
      'create policy "%1$s: admin update" on public.%1$I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format(
      'create policy "%1$s: admin delete" on public.%1$I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- The error log is write-only from clients.
revoke select, update, delete on public.client_error_logs from anon, authenticated;
-- Users may not rewrite delivery history.
revoke insert, update, delete on public.reminder_deliveries from anon, authenticated;
-- The anonymous role never needs user tables.
revoke all on public.profiles, public.mood_entries, public.journal_entries, public.meditation_history,
  public.exercise_history, public.reminders, public.push_subscriptions, public.user_favorites,
  public.affirmation_history, public.reminder_deliveries from anon;

grant execute on function public.get_daily_affirmation(date) to authenticated;
revoke execute on function public.get_daily_affirmation(date) from anon, public;
