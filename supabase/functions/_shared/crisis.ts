// Detection of language that may indicate someone is at risk. Dependency-free
// so the same patterns run in the browser and in Edge Functions. This is a
// prompt to surface support resources — not an assessment, and never the only safeguard.

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
