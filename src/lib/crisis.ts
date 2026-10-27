// On-device detection of language that may indicate someone is at risk.
// Text is checked locally and never sent anywhere. This is a gentle prompt to
// reach out for support — not an assessment, and never the only safeguard.

const PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm|cut)\s+(my\s*self|myself)\b/i,
  /\bsuicid(e|al)\b/i,
  /\b(end|take)\s+(my|my own)\s+life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\b(don'?t|do not)\s+want\s+to\s+(live|be alive|be here|exist)\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\bself[-\s]?harm/i,
  /\bwish\s+i\s+(was|were)\s+(dead|gone|never born)\b/i,
  /\bcan'?t\s+go\s+on\b/i,
  /\boverdose\b/i,
]

export function mayIndicateCrisis(text: string | null | undefined): boolean {
  if (!text) return false
  return PATTERNS.some(p => p.test(text))
}

export interface Helpline {
  name: string
  number: string
  tel: string
  hours: string
  note?: string
}

// India crisis-support lines. Re-verify before each release (see docs/LAUNCH_CHECKLIST.md).
export const INDIA_HELPLINES: Helpline[] = [
  { name: 'Emergency services', number: '112', tel: '112', hours: '24/7', note: 'If you are in immediate danger' },
  { name: 'Tele-MANAS (Govt. of India)', number: '14416', tel: '14416', hours: '24/7', note: 'Free mental health support in many Indian languages. Also 1-800-891-4416.' },
  { name: 'Vandrevala Foundation', number: '+91 9999 666 555', tel: '+919999666555', hours: '24/7', note: 'Call or WhatsApp' },
  { name: 'iCall (TISS)', number: '+91 91529 87821', tel: '+919152987821', hours: 'Mon–Sat, 10 am – 8 pm', note: 'Psychosocial helpline' },
  { name: 'AASRA', number: '+91 98204 66726', tel: '+919820466726', hours: '24/7' },
]

export const INTERNATIONAL_HELP_URL = 'https://findahelpline.com'
