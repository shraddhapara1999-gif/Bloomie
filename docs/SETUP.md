# Setup & Deployment

## 1. Local development

### Option A — no Docker (fastest)
```bash
npm install
npm run dev:backend   # http://localhost:54321
npm run dev           # http://localhost:5173
```
- `.env.local` targets the dev backend. Its anon key is signed with a public dev-only secret and must never be used elsewhere.
- Emails (verification, password reset) → <http://localhost:54321/__dev/mailbox>.
- `DEV_AUTO_CONFIRM=true npm run dev:backend` skips email verification.
- Delete `.dev-db/` to reset all local data.

### Option B — full local Supabase (Docker)
```bash
npx supabase start          # applies supabase/migrations
npx supabase status         # copy API URL + anon key into .env.local
npx supabase functions serve
npm run dev
```
Local emails go to Mailpit (URL shown by `supabase status`). Integration tests can target it:
`INTEGRATION_SUPABASE_URL=… INTEGRATION_SUPABASE_ANON_KEY=… npm test` (they read verification links from the dev-backend mailbox, so with Option B set `enable_confirmations = false` in `supabase/config.toml` or test against Option A).

## 2. Create the Supabase project

1. Create a project at <https://supabase.com> (pick a region close to your users, e.g. Mumbai `ap-south-1` for India).
2. Link and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push        # schema, RLS policies and seed content
   ```
3. **Auth → Providers → Email**: enable *Confirm email* and *Secure password change*. Set minimum password length 8.
4. **Auth → URL Configuration**:
   - Site URL: `https://<your-domain>`
   - Redirect URLs: `https://<your-domain>/auth/callback`, `https://<your-domain>/reset-password` (plus your Vercel preview pattern, e.g. `https://*-<team>.vercel.app/**`, if you want previews to log in).
5. **Auth → SMTP**: configure a custom SMTP sender (Supabase's built-in sender is rate-limited and not for production).
6. **Auth → Email templates**: optionally restyle with the Bloomie palette.
7. Optional **Google sign-in**: Auth → Providers → Google (OAuth client from Google Cloud with redirect `https://<project-ref>.supabase.co/auth/v1/callback`), then set `VITE_ENABLE_GOOGLE_AUTH=true`.

See [SUPABASE.md](SUPABASE.md) for the data model, RLS and admin roles.

## 3. Edge Functions

On Windows, `scripts\deploy-functions.cmd [app-url]` does all of the below in one go: it deploys the four functions without Docker (`--use-api`), generates a cron secret (saved to the git-ignored `supabase/.cron-secret`) and sets `APP_URL`, `ALLOWED_ORIGINS` and `CRON_SECRET`. Re-run it with your production URL after deploying to Vercel.

Manual equivalent:

```bash
npx supabase functions deploy delete-account
npx supabase functions deploy send-reminders --no-verify-jwt
npx supabase functions deploy unsubscribe --no-verify-jwt
npx supabase functions deploy ai-journal-prompt          # optional

npx supabase secrets set \
  APP_URL=https://<your-domain> \
  ALLOWED_ORIGINS=https://<your-domain> \
  CRON_SECRET=$(openssl rand -hex 32)
```

### Reminder notifications
| Channel | How it works | Setup |
|---|---|---|
| In-app | Browser notification while Bloomie is open in a tab | None (user grants permission) |
| Push | `send-reminders` sends Web Push to saved device subscriptions | `npx web-push generate-vapid-keys`; set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@domain` as function secrets **and** `VITE_VAPID_PUBLIC_KEY` in Vercel |
| Email | `send-reminders` sends via Resend, with one-click unsubscribe | Verify your domain at resend.com; set `RESEND_API_KEY`, `EMAIL_FROM="Bloomie <reminders@yourdomain>"` |

Then schedule the sender: open the SQL editor and run [`supabase/cron.sql`](../supabase/cron.sql) after creating the two Vault secrets described at its top (`cron_secret` must equal the `CRON_SECRET` function secret).

Delivery results appear in the app under **Reminders → Delivery history**. Without credentials, deliveries are recorded as *skipped* with the reason — never as sent. Quiet hours, the email opt-in and unsubscribe links are honoured server-side.

### Optional AI journal prompts
`npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`. Users must opt in under **Settings → Optional AI features** (consent dialog). Only focus areas and recent feeling tags are sent — never journal text. Without the key, the button returns a clear "not configured" message.

## 4. Deploy the frontend to Vercel

1. Push the repo to GitHub and import it in Vercel (framework preset: Vite — `vercel.json` sets build, SPA rewrites and security headers).
2. Environment variables (Production + Preview):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API)
   - optional `VITE_VAPID_PUBLIC_KEY`, `VITE_ENABLE_GOOGLE_AUTH`, `VITE_APP_RELEASE` (e.g. the git SHA)
3. Deploy, then add the production domain to Supabase Auth redirect URLs and `ALLOWED_ORIGINS`.
4. If you use a custom Supabase domain, add it to `connect-src` in the CSP in `vercel.json`.

**Never** put the service-role key or any provider secret in a `VITE_` variable.

## 5. Verify after deploying
- Sign up → receive email → link lands on `/auth/callback` → onboarding.
- Password reset email → `/reset-password` works.
- Create a check-in, journal entry and reminder; refresh — data persists.
- Create a second account and confirm it sees none of the first account's data.
- Set a push/email reminder 5 minutes ahead and check *Delivery history*.
- Settings → Export downloads JSON; Delete account removes the user (check Auth → Users).
