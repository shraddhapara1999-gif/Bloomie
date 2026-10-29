// "Talk to Bloomie" — consent-gated AI wellbeing companion (Google Gemini).
// POST { message } with the user's JWT. Streams Server-Sent Events:
//   {"type":"safety"}                 possible risk language detected → client shows helplines
//   {"type":"text","text":"..."}      reply text as it is generated
//   {"type":"done","id":"..."}        reply saved
//   {"type":"error","message":"..."}  something went wrong
// Chat history lives in public.companion_messages (RLS: owner only).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, log, requireEnv } from '../_shared/http.ts'
import { mayIndicateCrisis } from '../_shared/crisis.ts'
import { GeminiError, geminiConfig, streamGemini, type ChatTurn } from '../_shared/gemini.ts'

const MAX_MESSAGE_CHARS = 2000
const DAILY_MESSAGE_LIMIT = Number(Deno.env.get('COMPANION_DAILY_LIMIT') ?? '50')
const HISTORY_MESSAGES = 30

const SYSTEM = `You are Bloomie, a warm, gentle companion inside a self-care app called Bloomie. People talk to you about their day, their feelings, stress, sleep and small wellbeing habits.

How you talk:
- Be warm, calm and non-judgemental. Listen first; reflect back what you hear before offering anything.
- Keep replies short and conversational — usually 2 to 5 sentences. Ask at most one gentle question at a time.
- Use plain language. No lists or headings unless the person asks for steps. No markdown formatting.
- When it fits, you may suggest something the app offers: a breathing exercise or 5-4-3-2-1 grounding (Practice tab), a short meditation (Meditate tab), writing in the journal, or a mood check-in. Offer, never push.

Boundaries:
- You are an AI, not a therapist, doctor or crisis service. If asked, say so plainly. Never claim to be human.
- Do not diagnose, label feelings as disorders, or suggest, adjust or comment on medication or dosages.
- Do not give medical, legal or financial advice. Be honest about uncertainty.
- If difficulties sound persistent or are affecting daily life, gently encourage talking to a doctor, counsellor or someone they trust.

Safety:
- If someone may be thinking about suicide or self-harm, may harm someone else, or is in danger, respond with care and seriousness: acknowledge their pain without judgement, encourage them to contact help right now — emergency services on 112 (India), Tele-MANAS on 14416 (free, 24/7), or someone they trust nearby — and stay supportive. Do not provide information about methods.
- Never encourage harmful behaviour, including restrictive eating or self-punishment.`

const CRISIS_NOTE = 'Safety note from the app: the latest message may indicate risk of self-harm or danger. Respond with extra care, and clearly but gently share that they can call 112 (emergency) or Tele-MANAS on 14416 (free, 24/7), or reach someone they trust right now.'

const FALLBACK_REPLY = "I'm not able to respond to that one, but I'm still here. If you're going through something difficult, you can call Tele-MANAS on 14416 (free, 24/7) or 112 in an emergency."

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  if (!geminiConfig().apiKey) return json(req, { error: 'Talk to Bloomie is not set up on the server yet.', code: 'not_configured' }, 503)

  // Act as the caller so Row Level Security applies to every query.
  const authHeader = req.headers.get('Authorization') ?? ''
  const db = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  })
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json(req, { error: 'Please sign in again.' }, 401)

  const body = await req.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return json(req, { error: 'Message is empty.' }, 400)
  if (message.length > MAX_MESSAGE_CHARS) return json(req, { error: `Please keep messages under ${MAX_MESSAGE_CHARS} characters.` }, 400)

  const { data: profile } = await db.from('profiles').select('ai_opt_in, display_name').eq('id', user.id).single()
  if (!profile?.ai_opt_in) return json(req, { error: 'Turn on AI features to talk to Bloomie.', code: 'not_opted_in' }, 403)

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await db.from('companion_messages').select('id', { count: 'exact', head: true })
    .eq('role', 'user').gte('created_at', since)
  if ((count ?? 0) >= DAILY_MESSAGE_LIMIT) {
    return json(req, { error: `You've reached today's limit of ${DAILY_MESSAGE_LIMIT} messages. Bloomie will be here again tomorrow.`, code: 'daily_limit' }, 429)
  }

  const { data: history } = await db.from('companion_messages').select('role, content')
    .order('created_at', { ascending: false }).limit(HISTORY_MESSAGES)
  const flagged = mayIndicateCrisis(message)
  const { error: saveErr } = await db.from('companion_messages').insert({ role: 'user', content: message, flagged })
  if (saveErr) return json(req, { error: 'Could not save your message.' }, 500)

  // Oldest first; the conversation must start with a user turn.
  const past = (history ?? []).reverse()
  while (past.length && past[0].role !== 'user') past.shift()
  const turns: ChatTurn[] = [
    ...past.map(m => ({ role: m.role as ChatTurn['role'], content: m.content })),
    { role: 'user', content: message },
  ]

  const name = (profile.display_name ?? '').split(' ')[0].slice(0, 40)
  let system = name ? `${SYSTEM}\n\nThe person's first name is ${name}.` : SYSTEM
  if (flagged) system += `\n\n${CRISIS_NOTE}`

  const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController, event: Record<string, unknown>) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

  const stream = new ReadableStream({
    async start(controller) {
      if (flagged) send(controller, { type: 'safety' })
      let reply = ''
      let blocked = false
      try {
        for await (const event of streamGemini({ system, turns, maxOutputTokens: 1024 })) {
          if (event.type === 'blocked') { blocked = true; log('companion_blocked', { reason: event.reason }); break }
          reply += event.text
          send(controller, { type: 'text', text: event.text })
        }
        if (blocked || !reply.trim()) {
          const extra = reply ? `\n\n${FALLBACK_REPLY}` : FALLBACK_REPLY
          send(controller, { type: 'text', text: extra })
          reply += extra
        }
        const { data: saved } = await db.from('companion_messages')
          .insert({ role: 'assistant', content: reply.slice(0, 8000), flagged }).select('id').single()
        send(controller, { type: 'done', id: saved?.id ?? null })
        log('companion_reply', { flagged, blocked })
      } catch (e) {
        const status = e instanceof GeminiError ? e.status : 0
        log('companion_error', { status })
        if (status === 429) send(controller, { type: 'error', message: 'Bloomie is a bit busy right now. Please try again in a moment.' })
        else if ([400, 401, 403, 404].includes(status)) send(controller, { type: 'error', message: 'Talk to Bloomie is not set up correctly on the server.' })
        else send(controller, { type: 'error', message: 'Something went wrong. Please try again.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { ...corsHeaders(req), 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
  })
})
