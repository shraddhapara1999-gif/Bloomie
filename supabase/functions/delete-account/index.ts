// Permanently deletes the calling user's account. All user-owned rows are
// removed by ON DELETE CASCADE foreign keys on auth.users.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, log, requireEnv } from '../_shared/http.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const url = requireEnv('SUPABASE_URL')
    const anonKey = requireEnv('SUPABASE_ANON_KEY')
    const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json(req, { error: 'Not authenticated' }, 401)

    // Verify the caller's JWT and get their user id — never trust a user id from the body.
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json(req, { error: 'Not authenticated' }, 401)

    const body = await req.json().catch(() => ({}))
    if (body?.confirm !== true) return json(req, { error: 'Confirmation required' }, 400)

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) {
      log('delete_account_failed', { code: error.status ?? null })
      return json(req, { error: 'Could not delete account' }, 500)
    }
    log('account_deleted')
    return json(req, { ok: true })
  } catch (e) {
    log('delete_account_error', { message: e instanceof Error ? e.message : 'unknown' })
    return json(req, { error: 'Server error' }, 500)
  }
})
