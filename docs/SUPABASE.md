# Supabase: data model, security and operations

## Tables

| Table | Owner-scoped | Purpose |
|---|---|---|
| `profiles` | ✓ (`id = auth.uid()`) | Name, timezone, onboarding preferences, notification settings, AI consent. Created by trigger on signup. |
| `mood_entries` | ✓ | Mood score 1–5, emotion tags, energy/focus/stress/sleep, optional body signals & habits, optional note, local `entry_date` |
| `journal_entries` | ✓ | Title, content, type, prompt, tags, local date, optional link to the user's own mood entry, generated full-text `search` column |
| `meditation_sessions` | content | Published guided sessions with breathing pattern and timed guidance |
| `meditation_history` | ✓ | Per-play record: seconds completed, completed flag, timestamps |
| `exercises` | content | Step-by-step exercises |
| `exercise_history` | ✓ | Completion / stopped-early, optional reflection |
| `reminders` | ✓ | Type, local time, days of week, timezone, channel, enabled |
| `reminder_deliveries` | read-own | Server-written delivery log (unique per reminder + slot → no double sends) |
| `push_subscriptions` | ✓ | Web Push endpoints per device |
| `user_favorites` | ✓ | Favourite sessions / exercises / affirmations |
| `affirmations` | content | Affirmation library |
| `affirmation_history` | ✓ | One affirmation per user per local day (`get_daily_affirmation`) |
| `client_error_logs` | insert-only | Error message + route only — never entry content; unreadable through the API |

Timestamps are `timestamptz` (UTC). Calendar dates (`entry_date`, `displayed_on`) are computed in the user's timezone by the client. CHECK constraints mirror client-side Zod validation.

## Row Level Security
- RLS is enabled on **every** table.
- Owner tables: separate `select/insert/update/delete` policies with `user_id = (select auth.uid())` in both `USING` and `WITH CHECK`, so rows cannot be read, created for, or moved to another user.
- History inserts additionally require the referenced content to be published.
- Journal → mood links use a composite foreign key `(optional_mood_entry_id, user_id)`, so an entry can only link to the same user's check-in.
- Content tables are readable when `is_published`; writes require `public.is_admin()`.
- `anon` has no grants on user tables. `reminder_deliveries` and `client_error_logs` are not writable/readable by clients as appropriate.
- Account deletion cascades every user-owned row via `ON DELETE CASCADE` on `auth.users`.

These guarantees are tested in `tests/db/rls.test.ts` (25 tests running the real migrations in PGlite) and `tests/integration/api.test.ts` (end-to-end with supabase-js).

## Admins
Admins are users whose **app_metadata** contains `"role": "admin"` (only settable with the service-role key):
```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'you@domain.com';
```
The user must sign out and in again to refresh their token. Admins can add/edit/unpublish content via the Supabase Table Editor or SQL.

## Adding content
Insert rows into `meditation_sessions` / `exercises` / `affirmations` (see `20261027000003_seed_content.sql` for the JSON shapes). Use original or properly licensed text/audio only; `audio_url` may point to a file in Supabase Storage.

## Backups & recovery
- Enable **daily backups** (included on paid plans) and, for production, **Point-in-Time Recovery**.
- Keep migrations in git; never edit production schema by hand.
- Periodically test a restore into a staging project.
- Logical export for off-site copies: `npx supabase db dump --data-only -f backup.sql` (store encrypted; it contains sensitive personal data).
- Document a deletion process for backups to honour account-deletion requests within your stated retention period.

## Operational logging
- Edge Functions log JSON events with no user content (`send_reminders_run`, `account_deleted`, …) — view under Functions → Logs.
- Client errors land in `client_error_logs` (message + route + release only). Query via SQL editor; pruned after 90 days by `cron.sql`.
- Monitor Auth → Logs for unusual sign-in failure rates.
