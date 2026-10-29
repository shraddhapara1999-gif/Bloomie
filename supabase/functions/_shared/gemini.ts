// Minimal Google Gemini client for Edge Functions (REST + Server-Sent Events).
//
// Keys: classic Google AI Studio keys ("AIza…") use the Gemini API endpoint;
// newer Google Cloud keys ("AQ.…") use the Vertex AI express-mode endpoint.
// Override with GEMINI_ENDPOINT=gemini-api|vertex and GEMINI_MODEL=<model id>.

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export type GeminiEvent =
  | { type: 'text'; text: string }
  | { type: 'blocked'; reason: string }

export class GeminiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export function geminiConfig() {
  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'
  const forced = Deno.env.get('GEMINI_ENDPOINT')
  const endpoint = forced === 'vertex' || forced === 'gemini-api' ? forced : apiKey.startsWith('AIza') ? 'gemini-api' : 'vertex'
  return { apiKey, model, endpoint }
}

function streamUrl(endpoint: string, model: string) {
  return endpoint === 'vertex'
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:streamGenerateContent?alt=sse`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`
}

/** Stream a reply. Yields text chunks, or a `blocked` event if Google's safety filters stop it. */
export async function* streamGemini(opts: { system: string; turns: ChatTurn[]; maxOutputTokens?: number; signal?: AbortSignal }): AsyncGenerator<GeminiEvent> {
  const { apiKey, model, endpoint } = geminiConfig()
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not set', 503)

  const res = await fetch(streamUrl(endpoint, model), {
    method: 'POST',
    signal: opts.signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
      generationConfig: { maxOutputTokens: opts.maxOutputTokens ?? 2048 },
    }),
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new GeminiError(`Gemini request failed (${res.status}): ${detail.slice(0, 300)}`, res.status)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let sep: number
    while ((sep = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '')
      const data = frame.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
      if (!data) continue
      const chunk = JSON.parse(data)
      const blockReason = chunk?.promptFeedback?.blockReason
      if (blockReason) { yield { type: 'blocked', reason: String(blockReason) }; return }
      const candidate = chunk?.candidates?.[0]
      for (const part of candidate?.content?.parts ?? []) {
        if (typeof part?.text === 'string' && part.text && !part.thought) yield { type: 'text', text: part.text }
      }
      const finish = candidate?.finishReason
      if (finish && !['STOP', 'MAX_TOKENS', 'FINISH_REASON_UNSPECIFIED'].includes(finish)) {
        yield { type: 'blocked', reason: String(finish) }
        return
      }
    }
  }
}

/** Non-streaming convenience: collect the full reply text (empty string if blocked). */
export async function generateGemini(opts: { system: string; turns: ChatTurn[]; maxOutputTokens?: number }): Promise<string> {
  let text = ''
  for await (const e of streamGemini(opts)) {
    if (e.type === 'blocked') return ''
    text += e.text
  }
  return text.trim()
}
