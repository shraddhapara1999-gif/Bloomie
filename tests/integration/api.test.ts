// @vitest-environment node
// End-to-end API test with the real supabase-js client. Runs against any
// Supabase-compatible backend: the local `npm run dev:backend` emulator by
// default, or a real local stack via INTEGRATION_SUPABASE_URL / _ANON_KEY.
// Skipped automatically when no backend is reachable.
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL_ = process.env.INTEGRATION_SUPABASE_URL ?? 'http://localhost:54321'
const KEY = process.env.INTEGRATION_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImJsb29taWUtZGV2IiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.UEm0TJaKw3Zjk-EfB2Wo8TjoNgp9QHUO4Uyj4kVYYcc'

const reachable = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } }).then(r => r.ok).catch(() => false)
const memoryStorage = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
const client = () => createClient(URL_, KEY, { auth: { storage: memoryStorage(), persistSession: true, flowType: 'pkce', detectSessionInUrl: false } })

async function signUpVerified(c: SupabaseClient, email: string, name: string) {
  const { data, error } = await c.auth.signUp({ email, password: 'calm-breath-42', options: { data: { display_name: name, timezone: 'Asia/Kolkata' }, emailRedirectTo: 'http://localhost:5173/auth/callback' } })
  expect(error).toBeNull()
  expect(data.session).toBeNull() // email confirmation required
  const denied = await c.auth.signInWithPassword({ email, password: 'calm-breath-42' })
  expect(denied.error?.message).toMatch(/not confirmed/i)
  const mail = (await (await fetch(`${URL_}/__dev/mailbox`)).json()) as { to: string; link: string }[]
  const code = new URL(mail.find(m => m.to === email)!.link).searchParams.get('code')!
  const { data: s, error: e2 } = await c.auth.exchangeCodeForSession(code)
  expect(e2).toBeNull()
  return s.session!.user.id
}

describe.skipIf(!reachable)('API end-to-end (supabase-js)', () => {
  const run = Date.now()
  const a = client()
  const b = client()
  let aliceId = ''
  let journalId = ''

  beforeAll(async () => {
    aliceId = await signUpVerified(a, `alice+${run}@example.com`, 'Alice')
    await signUpVerified(b, `bob+${run}@example.com`, 'Bob')
  })

  it('creates a profile from signup metadata', async () => {
    const { data } = await a.from('profiles').select('*').eq('id', aliceId).single()
    expect(data).toMatchObject({ display_name: 'Alice', timezone: 'Asia/Kolkata', ai_opt_in: false })
  })

  it('rejects wrong passwords with a clear error', async () => {
    const { error } = await client().auth.signInWithPassword({ email: `alice+${run}@example.com`, password: 'wrong-pass-1' })
    expect(error?.message).toMatch(/invalid login credentials/i)
  })

  it('saves a mood check-in and journal entry, and finds it via search', async () => {
    const mood = await a.from('mood_entries').insert({ mood_score: 4, emotion_tags: ['calm'], entry_date: '2026-10-27', body_signals: { period_flow: 'None', symptoms: [] } }).select('*').single()
    expect(mood.error).toBeNull()
    expect(mood.data!.entry_date).toBe('2026-10-27') // dates are plain YYYY-MM-DD, as PostgREST returns them
    const j = await a.from('journal_entries').insert({ title: 'Morning', content: 'Grateful for sunshine', entry_type: 'gratitude', tags: ['sun'], entry_date: '2026-10-27', optional_mood_entry_id: mood.data!.id }).select('*').single()
    expect(j.error).toBeNull()
    journalId = j.data!.id
    const found = await a.from('journal_entries').select('id', { count: 'exact' }).textSearch('search', 'sunshine', { type: 'websearch', config: 'simple' }).contains('tags', ['sun'])
    expect(found.data).toHaveLength(1)
    expect(found.count).toBe(1)
  })

  it('never lets another user read or change the journal', async () => {
    const read = await b.from('journal_entries').select('*').eq('id', journalId)
    expect(read.data).toEqual([])
    const upd = await b.from('journal_entries').update({ content: 'hacked' }).eq('id', journalId).select('*')
    expect(upd.data).toEqual([])
    const spoof = await b.from('journal_entries').insert({ user_id: aliceId, content: 'spoof' })
    expect(spoof.error?.code).toBe('42501')
    const still = await a.from('journal_entries').select('content').eq('id', journalId).single()
    expect(still.data!.content).toBe('Grateful for sunshine')
  })

  it('anonymous requests cannot read private data but can read published content', async () => {
    const anon = client()
    expect((await anon.from('journal_entries').select('*')).error).not.toBeNull()
    const sessions = await anon.from('meditation_sessions').select('slug').eq('is_published', true)
    expect(sessions.data!.length).toBeGreaterThanOrEqual(15)
  })

  it('records meditation history and returns a stable daily affirmation', async () => {
    const s = await a.from('meditation_sessions').select('id').eq('slug', 'two-minute-reset').single()
    const h = await a.from('meditation_history').insert({ session_id: s.data!.id }).select('*').single()
    const done = await a.from('meditation_history').update({ completed: true, completed_at: new Date().toISOString(), duration_completed_seconds: 120 }).eq('id', h.data!.id).select('*').single()
    expect(done.data).toMatchObject({ completed: true, duration_completed_seconds: 120 })
    const one = await a.rpc('get_daily_affirmation', { p_local_date: '2026-10-27' })
    const two = await a.rpc('get_daily_affirmation', { p_local_date: '2026-10-27' })
    expect(one.data[0].id).toBe(two.data[0].id)
  })

  it('validates server-side constraints', async () => {
    const bad = await a.from('mood_entries').insert({ mood_score: 9 })
    expect(bad.error?.code).toBe('23514')
    const rem = await a.from('reminders').insert({ reminder_type: 'journal', scheduled_time: '09:00', days_of_week: [8] })
    expect(rem.error?.code).toBe('23514')
  })

  it('accepts error logs but never lets clients read them back', async () => {
    const write = await a.from('client_error_logs').insert({ message: 'test error', route: '/app' })
    expect(write.error).toBeNull()
    const read = await a.from('client_error_logs').select('*')
    expect(read.error).not.toBeNull()
  })

  it('deletes entries so they no longer appear', async () => {
    await a.from('journal_entries').delete().eq('id', journalId)
    const after = await a.from('journal_entries').select('id').eq('id', journalId)
    expect(after.data).toEqual([])
  })

  it('deletes the account and all its data', async () => {
    const { error } = await b.functions.invoke('delete-account', { body: { confirm: true } })
    expect(error).toBeNull()
    const relogin = await client().auth.signInWithPassword({ email: `bob+${run}@example.com`, password: 'calm-breath-42' })
    expect(relogin.error).not.toBeNull()
  })
})
