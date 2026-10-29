// Optional, consent-gated AI journal prompt (Google Gemini). Only the user's
// chosen focus areas and the emotion tags from their latest check-in are sent
// to the model — never journal text or notes. Requires profiles.ai_opt_in = true.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, log, requireEnv } from '../_shared/http.ts'
import { GeminiError, generateGemini, geminiConfig } from '../_shared/gemini.ts'

const SYSTEM = `You write one short, gentle journaling prompt for a self-care app.
Rules:
- Output only the prompt: a single question or sentence starter, under 30 words, no preamble, quotes or formatting.
- Warm, curious and non-judgemental. Invite reflection; do not give advice.
- Never diagnose, label feelings as disorders, mention medication, or present yourself as a therapist.
- If the feelings suggest distress, keep the prompt soft and grounding (e.g. noticing support or small comforts).`

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  if (!geminiConfig().apiKey) return json(req, { error: 'AI features are not configured on this server.', code: 'not_configured' }, 503)

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json(req, { error: 'Not authenticated' }, 401)

  // RLS scopes these reads to the caller.
  const { data: profile } = await userClient.from('profiles').select('ai_opt_in, onboarding_preferences').eq('id', user.id).single()
  if (!profile?.ai_opt_in) return json(req, { error: 'AI features are turned off. You can opt in from Settings.', code: 'not_opted_in' }, 403)
  const { data: mood } = await userClient.from('mood_entries').select('emotion_tags').order('created_at', { ascending: false }).limit(1).maybeSingle()

  const focus = ((profile.onboarding_preferences?.focus_areas ?? []) as string[]).slice(0, 6).join(', ') || 'general wellbeing'
  const feelings = ((mood?.emotion_tags ?? []) as string[]).slice(0, 6).join(', ') || 'not shared'

  try {
    const text = await generateGemini({
      system: SYSTEM,
      turns: [{ role: 'user', content: `Focus areas: ${focus}\nRecent feelings: ${feelings}\nWrite today's journaling prompt.` }],
      maxOutputTokens: 200,
    })
    if (!text) return json(req, { error: 'Could not generate a prompt right now.' }, 502)
    log('ai_prompt_generated')
    return json(req, { prompt: text.replace(/^["'“]|["'”]$/g, '').slice(0, 300), ai: true })
  } catch (e) {
    const status = e instanceof GeminiError ? e.status : 0
    log('ai_prompt_error', { status })
    if (status === 429) return json(req, { error: 'Too many requests. Please try again shortly.' }, 429)
    return json(req, { error: 'AI service error' }, 502)
  }
})
