import { check, db, supabase } from '../lib/supabase'
import { configStatus } from '../lib/env'

export interface CompanionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  flagged: boolean
  created_at: string
}

export async function listCompanionMessages(limit = 100): Promise<CompanionMessage[]> {
  const rows = check(await db().from('companion_messages').select('id, role, content, flagged, created_at')
    .order('created_at', { ascending: false }).limit(limit)) as CompanionMessage[]
  return rows.reverse()
}

export async function clearCompanionMessages(): Promise<void> {
  const { data } = await db().auth.getUser()
  if (!data.user) throw new Error('Please sign in again.')
  check(await db().from('companion_messages').delete().eq('user_id', data.user.id))
}

export class CompanionError extends Error {
  code?: string
  constructor(message: string, code?: string) { super(message); this.code = code }
}

/** Send a message and receive the reply as a stream of text chunks. */
export async function sendCompanionMessage(
  message: string,
  handlers: { onText: (chunk: string) => void; onSafety: () => void; signal?: AbortSignal },
): Promise<{ id: string | null }> {
  if (!supabase || !configStatus.config) throw new CompanionError('Not connected.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new CompanionError('Please sign in again.')

  let res: Response
  try {
    res = await fetch(`${configStatus.config.supabaseUrl}/functions/v1/ai-companion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: configStatus.config.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: handlers.signal,
    })
  } catch {
    throw new CompanionError('We could not reach Bloomie. Check your connection and try again.')
  }

  if (res.status === 404) throw new CompanionError('Talk to Bloomie is not set up on the server yet.', 'not_configured')
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null) as { error?: string; code?: string } | null
    throw new CompanionError(body?.error ?? 'Something went wrong. Please try again.', body?.code)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let id: string | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const line = frame.split('\n').find(l => l.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice(6)) as { type: string; text?: string; id?: string | null; message?: string }
      if (event.type === 'text' && event.text) handlers.onText(event.text)
      else if (event.type === 'safety') handlers.onSafety()
      else if (event.type === 'done') id = event.id ?? null
      else if (event.type === 'error') throw new CompanionError(event.message ?? 'Something went wrong.')
    }
  }
  return { id }
}
