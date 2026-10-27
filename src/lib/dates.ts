// Date helpers. Timestamps are stored in UTC; "local dates" (YYYY-MM-DD) are
// computed in the user's IANA timezone.

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** YYYY-MM-DD for `date` as seen in `timeZone`. */
export function localDateKey(date: Date | string, timeZone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const tz = isValidTimezone(timeZone) ? timeZone : 'UTC'
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Add whole days to a YYYY-MM-DD key (calendar arithmetic, timezone-free). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** Day of week (0 = Sunday) of a YYYY-MM-DD key. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function formatDateKey(key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', timeZone: isValidTimezone(timeZone) ? timeZone : 'UTC',
  }).format(new Date(iso))
}

/** "09:30:00" → "9:30 AM" (locale-aware). */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(Date.UTC(2000, 0, 1, h, m))
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(d)
}

export function greetingFor(date: Date, timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hourCycle: 'h23', timeZone: isValidTimezone(timeZone) ? timeZone : 'UTC',
  }).format(date))
  if (hour < 5) return 'Hello, night owl'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60)
  return m < 1 ? '<1 min' : `${m} min`
}

export function formatClockSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
