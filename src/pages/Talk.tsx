import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import clsx from 'clsx'
import { ArrowUp, LifeBuoy, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { BloomieMascot } from '../components/brand'
import { Button, Card, Chip, Dialog, ErrorState, LoadingBlock } from '../components/ui'
import { SafetyDialog } from '../components/Safety'
import { useUpdateProfile } from '../hooks/queries'
import { mayIndicateCrisis } from '../lib/crisis'
import { CompanionError, clearCompanionMessages, listCompanionMessages, sendCompanionMessage, type CompanionMessage } from '../services/companion'

const STARTERS = [
  "I'm feeling anxious today",
  'I had a hard day',
  'Help me wind down for sleep',
  "I can't focus",
  'Something good happened!',
]

export function TalkPage() {
  const { profile } = useAuth()
  if (!profile) return <LoadingBlock rows={2} />
  return profile.ai_opt_in ? <Chat /> : <Consent />
}

function Consent() {
  const update = useUpdateProfile()
  return (
    <div className="max-w-xl mx-auto">
      <div className="glass rounded-3xl p-6 text-center">
        <BloomieMascot size={72} className="mx-auto" />
        <h1 className="text-2xl font-extrabold mt-2">Talk to Bloomie</h1>
        <p className="text-sm text-muted-foreground mt-1">A gentle AI companion to talk things through, any time.</p>
        <div className="text-left mt-5 rounded-2xl bg-white/70 p-4 text-sm space-y-2">
          <p className="font-bold flex items-center gap-2"><ShieldCheck className="size-4 text-primary-strong" aria-hidden /> Before you start</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Bloomie is an <strong>AI</strong>, not a therapist, doctor or crisis service. It can't diagnose or give medical advice, and it can make mistakes.</li>
            <li>Your messages are sent securely through our server to our AI provider (Google Gemini) to create replies. Your journal and check-ins are <strong>not</strong> shared.</li>
            <li>Your conversation is saved privately to your account so Bloomie remembers the chat. You can delete it any time.</li>
            <li>If you're in danger or thinking of harming yourself, please call <a href="tel:112" className="underline font-semibold">112</a> or Tele-MANAS on <a href="tel:14416" className="underline font-semibold">14416</a>.</li>
          </ul>
        </div>
        <Button size="lg" block className="mt-5" loading={update.isPending}
          onClick={() => update.mutate({ ai_opt_in: true, ai_opt_in_at: new Date().toISOString() }, { onError: e => toast.error(e.message) })}>
          I understand — start talking
        </Button>
        <p className="text-xs text-muted-foreground mt-3">You can turn this off any time in <Link to="/app/settings" className="underline">Settings</Link>.</p>
      </div>
    </div>
  )
}

interface Bubble { key: string; role: 'user' | 'assistant'; content: string; pending?: boolean }

function Chat() {
  const qc = useQueryClient()
  const history = useQuery({ queryKey: ['companion'], queryFn: () => listCompanionMessages(100) })
  const [live, setLive] = useState<Bubble[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [safety, setSafety] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const saved: Bubble[] = (history.data ?? []).map((m: CompanionMessage) => ({ key: m.id, role: m.role, content: m.content }))
  const bubbles = [...saved, ...live]

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [bubbles.length, live])
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || sending) return
    setError(null)
    setInput('')
    setSending(true)
    if (mayIndicateCrisis(message)) setSafety(true)
    const replyKey = `reply-${Date.now()}`
    setLive([{ key: `me-${Date.now()}`, role: 'user', content: message }, { key: replyKey, role: 'assistant', content: '', pending: true }])
    abortRef.current = new AbortController()
    try {
      await sendCompanionMessage(message, {
        signal: abortRef.current.signal,
        onSafety: () => setSafety(true),
        onText: chunk => setLive(l => l.map(b => (b.key === replyKey ? { ...b, content: b.content + chunk, pending: false } : b))),
      })
      await qc.invalidateQueries({ queryKey: ['companion'] })
      setLive([])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      setError(msg)
      setInput(message)
      // The user's message may already be saved; refresh, then drop the placeholders.
      await qc.invalidateQueries({ queryKey: ['companion'] })
      setLive([])
      if (e instanceof CompanionError && e.code === 'not_opted_in') qc.invalidateQueries({ queryKey: ['profile'] })
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(input) }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input) }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-[calc(100dvh-12rem)] lg:min-h-[calc(100dvh-6rem)]">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <BloomieMascot size={44} />
          <div>
            <h1 className="text-xl font-extrabold leading-tight">Talk to Bloomie</h1>
            <p className="text-xs text-muted-foreground">AI companion · not a therapist</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/app/help" className="p-2.5 rounded-full hover:bg-white/60 text-primary-strong" aria-label="Crisis support"><LifeBuoy className="size-5" /></Link>
          {saved.length > 0 && <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} aria-label="Delete conversation"><Trash2 className="size-4" /></Button>}
        </div>
      </header>

      <section aria-label="Conversation" aria-live="polite" className="flex-1 space-y-3 pb-4">
        {history.isPending ? <LoadingBlock rows={2} label="Loading conversation" /> : history.error ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : bubbles.length === 0 ? (
          <Card className="text-center">
            <p className="font-display font-bold text-lg">Hi, I'm Bloomie 🌱</p>
            <p className="text-sm text-muted-foreground mt-1">What's on your mind? You can share as much or as little as you like.</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {STARTERS.map(s => <Chip key={s} onClick={() => void send(s)} disabled={sending}>{s}</Chip>)}
            </div>
          </Card>
        ) : bubbles.map(b => (
          <div key={b.key} className={clsx('flex gap-2 animate-fade-up', b.role === 'user' ? 'justify-end' : 'justify-start')}>
            {b.role === 'assistant' && <BloomieMascot size={30} className="shrink-0 mt-1" />}
            <div className={clsx('max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words',
              b.role === 'user' ? 'bg-primary-strong text-white rounded-br-md' : 'bg-card shadow-[var(--shadow-card)] rounded-bl-md')}>
              {b.pending ? <TypingDots /> : b.content}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </section>

      <div className="sticky bottom-24 lg:bottom-4">
        {error && <div role="alert" className="mb-2 rounded-xl bg-[#fbe9e6] text-[#7a2a20] px-3.5 py-2.5 text-sm">{error}</div>}
        <form onSubmit={onSubmit} className="glass rounded-3xl p-2 flex items-end gap-2">
          <label htmlFor="talk-input" className="sr-only">Message Bloomie</label>
          <textarea id="talk-input" ref={inputRef} rows={1} value={input} maxLength={2000}
            onChange={e => setInput(e.target.value)} onKeyDown={onKeyDown} disabled={sending}
            placeholder="Type how you're feeling…"
            className="flex-1 resize-none bg-transparent px-3 py-2.5 text-base outline-none max-h-40 field-sizing-content placeholder:text-muted-foreground/80" />
          <Button type="submit" size="sm" className="!rounded-full !size-11 !p-0" disabled={!input.trim()} loading={sending} aria-label="Send message">
            {!sending && <ArrowUp className="size-5" aria-hidden />}
          </Button>
        </form>
        <p className="text-[11px] text-center text-muted-foreground mt-1.5">Bloomie is an AI and can make mistakes. In an emergency call 112 · Tele-MANAS 14416.</p>
      </div>

      <SafetyDialog open={safety} onClose={() => setSafety(false)} context="chat" />
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} title="Delete this conversation?"
        footer={<><Button variant="soft" onClick={() => setConfirmClear(false)}>Keep it</Button>
          <Button variant="danger" onClick={async () => {
            try { await clearCompanionMessages(); await qc.invalidateQueries({ queryKey: ['companion'] }); setConfirmClear(false); toast.success('Conversation deleted') }
            catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete') }
          }}>Delete</Button></>}>
        <p>All messages with Bloomie will be permanently deleted from your account.</p>
      </Dialog>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" role="status" aria-label="Bloomie is typing">
      {[0, 1, 2].map(i => <span key={i} className="size-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
    </span>
  )
}
