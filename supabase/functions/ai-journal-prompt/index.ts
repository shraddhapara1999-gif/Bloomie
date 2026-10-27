// Optional, consent-gated AI journal prompt. Only the user's chosen focus areas
// and the emotion tags from their latest check-in are sent to the model —
// never journal text or notes. Requires profiles.ai_opt_in = true.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, log, requireEnv } from '../_shared/http.ts'

const SYSTEM = `You write one short, gentle journaling prompt for a self-care app.
Rules:
- Output only the prompt: a single question or sentence starter, under 30 words, no preamble or quotes.
- Warm, curious and non-judgemental. Invite reflection; do not give advice.
- Never diagnose, label feelings as disorders, mention medication, or present yourself as a therapist.
- If the feelings suggest distress, keep the prompt soft and grounding (e.g. noticing support or small comforts).`

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json(req, { error: 'AI features are not configured on this server.', code: 'not_configured' }, 503)

  const url = requireEnv('SUPABASE_URL')
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, requireEnv('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json(req, { error: 'Not authenticated' }, 401)

  // RLS scopes these reads to the caller.
  const { data: profile } = await userClient.from('profiles').select('ai_opt_in, onboarding_preferences').eq('id', user.id).single()
  if (!profile?.ai_opt_in) return json(req, { error: 'AI features are turned off. You can opt in from Settings.', code: 'not_opted_in' }, 403)
  const { data: mood } = await userClient.from('mood_entries').select('emotion_tags').order('created_at', { ascending: false }).limit(1).maybeSingle()

  const focus = ((profile.onboarding_preferences?.focus_areas ?? []) as string[]).slice(0, 6).join(', ') || 'general wellbeing'
  const feelings = ((mood?.emotion_tags ?? []) as string[]).slice(0, 6).join(', ') || 'not shared'

  const client = new Anthropic({ apiKey })
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Focus areas: ${focus}\nRecent feelings: ${feelings}\nWrite today's journaling prompt.` }],
    } as Parameters<typeof client.beta.messages.create>[0])

    if (!('content' in response)) return json(req, { error: 'Unexpected response' }, 502)
    if (response.stop_reason === 'refusal') return json(req, { error: 'Could not generate a prompt right now.' }, 502)
    const text = response.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('').trim()
    if (!text) return json(req, { error: 'Could not generate a prompt right now.' }, 502)
    log('ai_prompt_generated')
    return json(req, { prompt: text.slice(0, 300), ai: true })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(req, { error: 'Too many requests. Please try again shortly.' }, 429)
    if (e instanceof Anthropic.APIError) { log('ai_prompt_api_error', { status: e.status ?? null }); return json(req, { error: 'AI service error' }, 502) }
    log('ai_prompt_error')
    return json(req, { error: 'Server error' }, 500)
  }
})
