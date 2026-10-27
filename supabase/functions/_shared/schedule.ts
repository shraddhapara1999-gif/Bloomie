// Timezone-aware reminder scheduling. Dependency-free so the same code runs in
// the browser (Vite), in tests (Vitest/Node) and in Supabase Edge Functions (Deno).

export interface SchedulableReminder {
  scheduled_time: string // "HH:MM" or "HH:MM:SS", wall-clock time in `timezone`
  days_of_week: number[] // 0 = Sunday
  timezone: string
  enabled: boolean
}

export interface LocalParts {
  dateKey: string // YYYY-MM-DD
  weekday: number
  minutes: number // minutes since local midnight
}

function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(timeZone), hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Offset (ms) of `timeZone` from UTC at instant `utcMs`. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz(timeZone), hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(p.find(x => x.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Convert a wall-clock time on a local date in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(dateKey: string, minutes: number, timeZone: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60)
  let ts = guess - tzOffsetMs(guess, timeZone)
  // Second pass corrects for DST transitions between the guess and the result.
  ts = guess - tzOffsetMs(ts, timeZone)
  return new Date(ts)
}

/** True if `minutes` falls within quiet hours [start, end), which may wrap past midnight. */
export function inQuietHours(minutes: number, start: string | null, end: string | null): boolean {
  if (!start || !end) return false
  const s = parseClock(start)
  const e = parseClock(end)
  if (s === e) return false
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e
}

/**
 * If the reminder's local time falls within the window (now - windowMinutes, now],
 * return the exact UTC instant it was scheduled for; otherwise null.
 */
export function dueOccurrence(r: SchedulableReminder, now: Date, windowMinutes: number): Date | null {
  if (!r.enabled) return null
  const target = parseClock(r.scheduled_time)
  // Check today and yesterday (in the reminder's timezone) to handle windows crossing midnight.
  for (const back of [0, 1]) {
    const probe = new Date(now.getTime() - back * 86_400_000)
    const { dateKey, weekday } = localParts(probe, r.timezone)
    if (!r.days_of_week.includes(weekday)) continue
    const at = zonedTimeToUtc(dateKey, target, r.timezone)
    const diff = now.getTime() - at.getTime()
    if (diff >= 0 && diff < windowMinutes * 60_000) return at
  }
  return null
}

/** The next time this reminder will fire after `now`, or null if disabled. */
export function nextOccurrence(r: SchedulableReminder, now: Date): Date | null {
  if (!r.enabled || r.days_of_week.length === 0) return null
  const target = parseClock(r.scheduled_time)
  for (let i = 0; i <= 7; i++) {
    const { dateKey, weekday } = localParts(new Date(now.getTime() + i * 86_400_000), r.timezone)
    if (!r.days_of_week.includes(weekday)) continue
    const at = zonedTimeToUtc(dateKey, target, r.timezone)
    if (at.getTime() > now.getTime()) return at
  }
  return null
}
