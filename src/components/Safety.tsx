import { Phone, ExternalLink, Heart } from 'lucide-react'
import { Link } from 'react-router'
import { INDIA_HELPLINES, INTERNATIONAL_HELP_URL } from '../lib/crisis'
import { Button, Dialog } from './ui'

export function HelplineList({ compact }: { compact?: boolean }) {
  return (
    <ul className="space-y-2">
      {INDIA_HELPLINES.map(h => (
        <li key={h.name} className="flex items-center justify-between gap-3 rounded-2xl bg-muted p-3">
          <div className="min-w-0">
            <p className="font-bold text-sm">{h.name}</p>
            {!compact && h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
            <p className="text-xs text-muted-foreground">{h.hours}</p>
          </div>
          <a href={`tel:${h.tel}`} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-primary-strong text-white px-3 py-2 text-sm font-bold min-h-11"
            aria-label={`Call ${h.name} at ${h.number}`}>
            <Phone className="size-4" aria-hidden /> {h.number}
          </a>
        </li>
      ))}
      <li className="text-xs text-muted-foreground pt-1">
        Outside India? Find a free, confidential helpline at{' '}
        <a href={INTERNATIONAL_HELP_URL} target="_blank" rel="noreferrer" className="font-semibold text-primary-strong underline inline-flex items-center gap-0.5">
          findahelpline.com <ExternalLink className="size-3" aria-hidden />
        </a>
      </li>
    </ul>
  )
}

/** Shown when text may indicate someone is at risk. Never blocks saving. */
export function SafetyDialog({ open, onClose, context = 'entry' }: { open: boolean; onClose: () => void; context?: 'entry' | 'chat' }) {
  return (
    <Dialog open={open} onClose={onClose} title="You don't have to carry this alone"
      footer={<Button variant="soft" onClick={onClose}>Return to what I was doing</Button>}>
      <div className="space-y-3">
        <p className="flex gap-2"><Heart className="size-5 text-accent-strong shrink-0" aria-hidden />
          It sounds like things might be really hard right now. Thank you for writing it down. If you are thinking about harming yourself or feel unsafe, please reach out to someone now.</p>
        <p className="font-semibold">If you are in immediate danger, call <a href="tel:112" className="underline text-primary-strong">112</a> or go to the nearest emergency department.</p>
        <p>Talking to someone you trust — a friend, family member, or a trained counsellor — can help. These free services are available:</p>
        <HelplineList compact />
        <p className="text-xs text-muted-foreground">{context === 'chat'
            ? 'Bloomie is an AI and cannot respond to emergencies or contact anyone for you. Please reach out to a person who can help.'
            : 'Bloomie is an app and cannot respond to emergencies. Your entry has not been shared with anyone.'}</p>
      </div>
    </Dialog>
  )
}

export function HelpContent() {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #3b7a87, #2c5a63)' }} aria-labelledby="urgent">
        <h2 id="urgent" className="text-xl font-extrabold">Need help right now?</h2>
        <p className="text-sm mt-1 opacity-95">If you might hurt yourself or someone else, or you are in danger, call emergency services on <a href="tel:112" className="font-bold underline">112</a> (India) or your local emergency number. You can also reach out to someone you trust.</p>
      </section>
      <section className="bg-card rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-card)]" aria-labelledby="lines">
        <h2 id="lines" className="font-bold text-lg mb-3">Free support lines in India</h2>
        <HelplineList />
        <p className="text-xs text-muted-foreground mt-3">Numbers are provided for convenience and were verified at the time of publishing. Hours may change.</p>
      </section>
      <section className="bg-card rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-card)] text-sm space-y-2" aria-labelledby="about">
        <h2 id="about" className="font-bold text-lg">About Bloomie</h2>
        <p>Bloomie is a self-care companion. It is not a diagnostic tool, therapy or a crisis service, and it cannot monitor your safety. Changes in mood are a normal part of life; if low mood, anxiety or other difficulties persist or affect your daily life, consider speaking with a doctor or licensed mental health professional.</p>
        <p>Questions about your account or data? Contact <strong>[support email]</strong>.</p>
        <p className="flex gap-4 font-semibold"><Link to="/privacy" className="text-primary-strong underline">Privacy Policy</Link><Link to="/terms" className="text-primary-strong underline">Terms</Link></p>
      </section>
    </div>
  )
}
