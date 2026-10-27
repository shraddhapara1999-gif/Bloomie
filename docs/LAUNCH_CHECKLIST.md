# Launch checklist

Tick each item for the production environment. Bloomie should not be described as production-ready until every **Required** item is done.

## Required
- [ ] Supabase project created in the intended region; `supabase db push` applied
- [ ] Email confirmation ON, custom SMTP configured, redirect URLs set for the production domain
- [ ] `delete-account`, `send-reminders`, `unsubscribe` functions deployed; `CRON_SECRET`, `APP_URL`, `ALLOWED_ORIGINS` set
- [ ] `supabase/cron.sql` scheduled (Vault secrets created)
- [ ] Vercel env vars set; no secrets in `VITE_` variables; `.env*` files not committed
- [ ] Two-account check in production: account B cannot see account A's journal/check-ins
- [ ] Sign-up, verification, login, logout, password reset tested on the production domain
- [ ] Data export and account deletion tested on production
- [ ] Privacy Policy and Terms reviewed by a lawyer for your jurisdictions (DPDP Act 2023 for India; GDPR if serving the EU); placeholders `[…]` filled in
- [ ] Grievance officer / contact email published (required under Indian IT Rules)
- [ ] Helpline numbers and hours re-verified (`src/lib/crisis.ts`); international fallback link works
- [ ] Clinical/safety review of copy, crisis flow and exercise instructions by a qualified mental-health professional
- [ ] Backups enabled (PITR recommended) and a restore tested
- [ ] `npm test` and `npm run build` pass on the release commit

## Recommended
- [ ] Web Push (VAPID) and/or email (Resend) configured and a test reminder delivered
- [ ] Error monitoring/alerting (Sentry or similar) with PII scrubbing
- [ ] Rate limits reviewed in Supabase Auth settings; CAPTCHA on sign-up if abused
- [ ] Lighthouse/axe accessibility audit; manual screen-reader pass (VoiceOver, TalkBack)
- [ ] Real-device test on low-end Android and iOS Safari (notifications, speech, audio)
- [ ] Playwright end-to-end suite in CI against a staging project
- [ ] Analytics (if any) configured to exclude journal text, notes and mood data
- [ ] Status/incident contact and support inbox monitored

## Optional
- [ ] Google sign-in
- [ ] AI journal prompts (`ANTHROPIC_API_KEY`), with consent copy reviewed
- [ ] Admin content tooling
