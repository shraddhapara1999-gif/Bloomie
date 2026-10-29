// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env: Record<string, string> = {}
;(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => env[k] } }
const { generateGemini, geminiConfig, streamGemini, GeminiError } = await import('./gemini')

function sse(chunks: string[], status = 200) {
  const enc = new TextEncoder()
  return new Response(new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close() },
  }), { status })
}
const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\r\n\r\n`
const text = (t: string, finishReason?: string) => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] }, ...(finishReason ? { finishReason } : {}) }] })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); for (const k of Object.keys(env)) delete env[k] })
afterEach(() => vi.unstubAllGlobals())

describe('gemini config', () => {
  it('routes classic AI Studio keys to the Gemini API and newer keys to Vertex', () => {
    env.GEMINI_API_KEY = 'AIzaExample'
    expect(geminiConfig().endpoint).toBe('gemini-api')
    env.GEMINI_API_KEY = 'AQ.Example'
    expect(geminiConfig().endpoint).toBe('vertex')
    env.GEMINI_ENDPOINT = 'gemini-api'
    expect(geminiConfig().endpoint).toBe('gemini-api')
    expect(geminiConfig().model).toBe('gemini-flash-latest')
  })
})

describe('streamGemini', () => {
  beforeEach(() => { env.GEMINI_API_KEY = 'AIzaTest' })

  it('streams text, including frames split across network chunks', async () => {
    const body = frame(text('Hello ')) + frame(text('there.', 'STOP'))
    fetchMock.mockResolvedValue(sse([body.slice(0, 17), body.slice(17, 60), body.slice(60)]))
    const out: string[] = []
    for await (const e of streamGemini({ system: 'sys', turns: [{ role: 'user', content: 'hi' }] })) if (e.type === 'text') out.push(e.text)
    expect(out.join('')).toBe('Hello there.')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse')
    expect(init.headers['x-goog-api-key']).toBe('AIzaTest')
    const sent = JSON.parse(init.body)
    expect(sent.systemInstruction.parts[0].text).toBe('sys')
    expect(sent.contents).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }])
  })

  it('maps assistant turns to the "model" role', async () => {
    fetchMock.mockResolvedValue(sse([frame(text('ok', 'STOP'))]))
    await generateGemini({ system: 's', turns: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user'])
  })

  it('reports safety blocks instead of text', async () => {
    fetchMock.mockResolvedValue(sse([frame(text('Partial ')), frame({ candidates: [{ finishReason: 'SAFETY' }] })]))
    const events = []
    for await (const e of streamGemini({ system: 's', turns: [{ role: 'user', content: 'x' }] })) events.push(e)
    expect(events).toEqual([{ type: 'text', text: 'Partial ' }, { type: 'blocked', reason: 'SAFETY' }])

    fetchMock.mockResolvedValue(sse([frame({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })]))
    expect(await generateGemini({ system: 's', turns: [{ role: 'user', content: 'x' }] })).toBe('')
  })

  it('ignores "thought" parts', async () => {
    fetchMock.mockResolvedValue(sse([frame({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: 'Answer' }] }, finishReason: 'STOP' }] })]))
    expect(await generateGemini({ system: 's', turns: [{ role: 'user', content: 'x' }] })).toBe('Answer')
  })

  it('throws a GeminiError with the HTTP status on API errors', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"message":"API key not valid"}}', { status: 400 }))
    await expect(generateGemini({ system: 's', turns: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ status: 400 })
    await expect(generateGemini({ system: 's', turns: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(GeminiError)
  })

  it('refuses to run without a key', async () => {
    delete env.GEMINI_API_KEY
    await expect(generateGemini({ system: 's', turns: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ status: 503 })
  })

  it('uses the Vertex endpoint for AQ. keys', async () => {
    env.GEMINI_API_KEY = 'AQ.Test'
    fetchMock.mockResolvedValue(sse([frame(text('ok', 'STOP'))]))
    await generateGemini({ system: 's', turns: [{ role: 'user', content: 'x' }] })
    expect(fetchMock.mock.calls[0][0]).toBe('https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-flash-latest:streamGenerateContent?alt=sse')
  })
})
