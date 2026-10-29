// On-device detection of language that may indicate someone is at risk (shared
// with the AI companion function). Journal text is checked locally only. This is a gentle prompt to
// reach out for support — not an assessment, and never the only safeguard.

export { mayIndicateCrisis } from '../../supabase/functions/_shared/crisis'

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
