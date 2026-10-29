# Bloomie — Mental Wellness Companion

A gentle, private wellbeing app: daily mood check-ins, guided meditation, breathing and grounding exercises, a private journal, reminders and personal progress reports.

Built from the **Bloomie** Figma Make design (mint/teal palette, Nunito + Outfit, mascot and floral artwork, the 3-step *Mind → Body → Habits* check-in).

> Bloomie supports everyday wellbeing. It is **not** a medical device, therapy or a crisis service.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, Zod, Recharts |
| Backend | Supabase — PostgreSQL with Row Level Security, Auth, Edge Functions (Deno) |
| Notifications | In-app browser notifications, Web Push (VAPID), email (Resend) via a scheduled Edge Function |
| Optional AI | Consent-gated "Talk to Bloomie" chat and journal prompts via Google Gemini, server-side only |
| Hosting | Vercel (frontend) + Supabase (backend) |

## Quick start (local, no Docker needed)

```bash
npm install
npm run dev:backend   # terminal 1 — local Supabase-compatible backend on :54321 (PGlite + real RLS)
npm run dev           # terminal 2 — http://localhost:5173
```

`.env.local` already points the app at the local backend. Verification and password-reset emails appear at <http://localhost:54321/__dev/mailbox> (and in the backend terminal). Data persists in `.dev-db/`.

> The dev backend emulates only the parts of Supabase Auth/REST this app uses, for local development. Use a real Supabase project (or `supabase start` with Docker) for staging and production — see [docs/SETUP.md](docs/SETUP.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run dev:backend` | Local backend emulator (PGlite running the real migrations + RLS) |
| `npm test` | All tests (unit, component, database/RLS, API integration*) |
| `npm run test:db` | Database schema + RLS tests only |
| `npm run build` | Type-check and production build |
| `npm run lint` | oxlint |

\* The API integration suite runs when a backend is reachable (the dev backend or `INTEGRATION_SUPABASE_URL`), and is skipped otherwise.

## Project layout

```
src/
  auth/            Auth context (session, profile, timezone)
  components/      UI kit, app shell, charts, meditation player, safety dialogs
  hooks/queries.ts React Query hooks (all data access goes through services/)
  lib/             Pure logic: reports, streaks, breathing, timer, validation, crisis detection, CSV
  pages/           Screens (dashboard, check-in, meditate, practice, journal, reminders, progress, settings…)
  services/        Supabase data access per domain
supabase/
  migrations/      Schema, RLS policies, seed content (meditations, exercises, affirmations)
  functions/       Edge Functions: delete-account, send-reminders, unsubscribe, ai-journal-prompt
  cron.sql         pg_cron schedule for reminders (run once per environment)
scripts/dev-backend.ts   Local backend emulator
tests/             DB/RLS tests (PGlite) and API integration tests (supabase-js)
docs/              Setup, Supabase, deployment and launch checklist
```

## Feature status

### Implemented and tested
- Sign up / sign in / sign out, email verification, password reset, session persistence, protected routes, friendly auth errors
- Onboarding (goals, meditation length, journaling style, optional cycle tracking, reminder times) — every step skippable, editable later in Settings
- Dashboard: greeting, quick check-in, daily suggestion, recommendations, affirmation (stable per day), gentle streak, weekly chart, upcoming reminders, recent sessions
- Full check-in from the Figma design (Mind → Body → Habits → summary) saved to the database
- Meditation library (16 original sessions; search, category, duration 2/5/10/15/20, favourites, recent) and player (timer, animated breathing guide, timed guidance, pause/resume/restart/end, generated ambient sound, optional spoken guidance, lock-screen controls, history saving)
- 9 interactive exercises with steps, timers, gentler-pace option, stop-if-uncomfortable, reflection and history
- **Talk to Bloomie**: opt-in AI companion chat (Google Gemini, server-side only) with streaming replies, safety rules, crisis detection and helplines, private deletable history, and a daily message limit
- Private journal: create/edit/delete, prompts, types, tags, date, link to a check-in, full-text search, filters, calendar, pagination, Markdown/CSV export, unsaved-changes guard
- Reminders: create/edit/enable/disable/delete, days and times, timezone-aware, quiet hours, channels, delivery history
- Progress: 7/30/90-day mood & energy, meditation minutes (daily/weekly), sessions, journal frequency, exercises, mood distribution, top feelings, streaks, period-over-period comparison, CSV export, accessible chart tables
- Privacy: RLS on every user table, full JSON data export, account deletion, write-only error log without user content
- Safety: on-device detection of at-risk language → calm support dialog with India helplines (112, Tele-MANAS 14416, Vandrevala, iCall, AASRA); Help page always one tap away
- Accessibility: keyboard focus styles, skip link, labelled controls, AA-contrast tokens, reduced-motion support, chart table views
- Responsive: mobile bottom nav, desktop sidebar, no horizontal scroll at 375px

### Implemented — needs your credentials to work in production
| Feature | Needs |
|---|---|
| Everything above in production | A Supabase project URL + anon key |
| Email reminders | Resend API key + verified sender domain |
| Web push (closed-app reminders) | VAPID key pair |
| Scheduled delivery | Deploy `send-reminders` + run `supabase/cron.sql` |
| Account deletion | Deploy `delete-account` function |
| Google sign-in | Google OAuth client configured in Supabase, then `VITE_ENABLE_GOOGLE_AUTH=true` |
| Talk to Bloomie + AI journal prompts (optional) | `GEMINI_API_KEY` function secret (Google, billing-enabled project); users must opt in |

When these are missing the app says so (e.g. "push not configured", deliveries logged as *skipped*) instead of pretending.

### Still needs work before a public launch
- Legal review of the Privacy Policy and Terms templates (placeholders marked `[…]`)
- Re-verify helpline numbers and hours
- Content management UI for admins (today: Supabase dashboard/SQL; RLS already restricts writes to admins)
- End-to-end browser test automation (Playwright) and an accessibility audit with real screen-reader users
- Third-party error monitoring (e.g. Sentry) if you want alerting beyond the built-in error log

See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).
