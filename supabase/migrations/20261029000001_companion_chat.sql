-- "Talk to Bloomie" AI companion: per-user chat history.
-- Only used after the user opts in (profiles.ai_opt_in). Private to the owner,
-- deletable at any time, and removed with the account.

create table public.companion_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  -- Set when on-device / server checks found possible risk language (for showing support resources).
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index companion_messages_user_idx on public.companion_messages (user_id, created_at desc);

alter table public.companion_messages enable row level security;

create policy "companion_messages: read own" on public.companion_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "companion_messages: insert own" on public.companion_messages
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "companion_messages: delete own" on public.companion_messages
  for delete to authenticated using (user_id = (select auth.uid()));
-- No update policy: messages are append-only.

revoke all on public.companion_messages from anon;
