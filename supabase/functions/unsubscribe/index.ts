// One-click unsubscribe from reminder emails (linked in every reminder email).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { log, requireEnv } from '../_shared/http.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const page = (msg: string, status = 200) => new Response(
    `<!doctype html><meta name="viewport" content="width=device-width"><title>Bloomie</title><body style="font-family:sans-serif;background:#cce0d8;color:#1e3a35;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;padding:28px;border-radius:24px;max-width:360px;text-align:center"><h1 style="color:#3b7a87">Bloomie</h1><p>${msg}</p></div></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

  if (!UUID.test(token)) return page('This unsubscribe link is not valid.', 400)
  const admin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const { data, error } = await admin.from('profiles').update({ email_notifications: false }).eq('unsubscribe_token', token).select('id')
  if (error) { log('unsubscribe_failed'); return page('Something went wrong. Please try again later.', 500) }
  if (!data?.length) return page('This unsubscribe link is not valid.', 400)
  log('unsubscribed')
  return page('You have been unsubscribed from reminder emails. You can turn them back on anytime in Bloomie → Reminders.')
})
