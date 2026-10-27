// Report calculations. Pure functions over the user's real records — nothing
// here invents data: days with no records are reported as empty (null / 0).
import { addDays, daysBetween, formatDateKey, localDateKey } from './dates'
import type { ExerciseHistory, JournalEntry, MeditationHistory, MoodEntry } from './types'

export interface ActivityData {
  moods: Pick<MoodEntry, 'mood_score' | 'entry_date' | 'emotion_tags' | 'energy_level' | 'stress_level'>[]
  meditations: Pick<MeditationHistory, 'duration_completed_seconds' | 'completed' | 'started_at'>[]
  journals: Pick<JournalEntry, 'entry_date'>[]
  exercises: Pick<ExerciseHistory, 'completed' | 'started_at'>[]
}

export interface DayPoint {
  date: string
  label: string
  mood: number | null
  energy: number | null
  moodCount: number
  meditationMinutes: number
  meditationSessions: number
  journalCount: number
  exerciseCount: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** One point per day for `days` days ending at `endKey` (inclusive). */
export function dailySeries(data: ActivityData, endKey: string, days: number, timeZone: string): DayPoint[] {
  const startKey = addDays(endKey, -(days - 1))
  const points = new Map<string, DayPoint & { _m: number[]; _e: number[] }>()
  for (let i = 0; i < days; i++) {
    const date = addDays(startKey, i)
    points.set(date, {
      date,
      label: formatDateKey(date, days <= 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }),
      mood: null, energy: null, moodCount: 0, meditationMinutes: 0, meditationSessions: 0,
      journalCount: 0, exerciseCount: 0, _m: [], _e: [],
    })
  }
  for (const m of data.moods) {
    const p = points.get(m.entry_date)
    if (!p) continue
    p._m.push(m.mood_score)
    if (m.energy_level) p._e.push(m.energy_level)
  }
  for (const h of data.meditations) {
    const p = points.get(localDateKey(h.started_at, timeZone))
    if (!p) continue
    p.meditationMinutes += h.duration_completed_seconds / 60
    if (h.completed) p.meditationSessions += 1
  }
  for (const j of data.journals) {
    const p = points.get(j.entry_date)
    if (p) p.journalCount += 1
  }
  for (const e of data.exercises) {
    if (!e.completed) continue
    const p = points.get(localDateKey(e.started_at, timeZone))
    if (p) p.exerciseCount += 1
  }
  return [...points.values()].map(({ _m, _e, ...p }) => ({
    ...p,
    mood: _m.length ? round1(avg(_m)!) : null,
    energy: _e.length ? round1(avg(_e)!) : null,
    moodCount: _m.length,
    meditationMinutes: Math.round(p.meditationMinutes * 10) / 10,
  }))
}

/** Group daily points into weeks (7-day buckets ending at the last point). */
export function weeklyMeditation(points: DayPoint[]): { label: string; minutes: number; sessions: number }[] {
  const out: { label: string; minutes: number; sessions: number }[] = []
  for (let end = points.length; end > 0; end -= 7) {
    const slice = points.slice(Math.max(0, end - 7), end)
    out.unshift({
      label: `${formatDateKey(slice[0].date, { day: 'numeric', month: 'short' })}`,
      minutes: Math.round(slice.reduce((a, p) => a + p.meditationMinutes, 0)),
      sessions: slice.reduce((a, p) => a + p.meditationSessions, 0),
    })
  }
  return out
}

export function moodDistribution(moods: { mood_score: number }[]): { score: number; count: number }[] {
  const counts = [0, 0, 0, 0, 0]
  for (const m of moods) if (m.mood_score >= 1 && m.mood_score <= 5) counts[m.mood_score - 1]++
  return counts.map((count, i) => ({ score: i + 1, count }))
}

export function topEmotions(moods: { emotion_tags: string[] }[], limit = 5): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const m of moods) for (const t of m.emotion_tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, limit)
}

/** All local dates on which the user did any wellness activity. */
export function activeDates(data: ActivityData, timeZone: string): Set<string> {
  const s = new Set<string>()
  data.moods.forEach(m => s.add(m.entry_date))
  data.journals.forEach(j => s.add(j.entry_date))
  data.meditations.forEach(h => { if (h.duration_completed_seconds >= 60 || h.completed) s.add(localDateKey(h.started_at, timeZone)) })
  data.exercises.forEach(e => { if (e.completed) s.add(localDateKey(e.started_at, timeZone)) })
  return s
}

/**
 * Current streak counts consecutive active days ending today — or ending
 * yesterday, so a streak is not shown as "lost" before today is over.
 */
export function streaks(dates: Set<string>, todayKey: string): { current: number; longest: number; activeToday: boolean } {
  const activeToday = dates.has(todayKey)
  let current = 0
  let cursor = activeToday ? todayKey : addDays(todayKey, -1)
  while (dates.has(cursor)) { current++; cursor = addDays(cursor, -1) }

  const sorted = [...dates].filter(d => d <= todayKey).sort()
  let longest = 0
  let run = 0
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  return { current, longest, activeToday }
}

export interface PeriodSummary {
  averageMood: number | null
  checkIns: number
  meditationMinutes: number
  meditationSessions: number
  journalEntries: number
  exercisesCompleted: number
  activeDays: number
}

export function summarize(points: DayPoint[]): PeriodSummary {
  const moodDays = points.filter(p => p.mood !== null)
  const totalMoodWeight = moodDays.reduce((a, p) => a + p.moodCount, 0)
  return {
    averageMood: totalMoodWeight ? round1(moodDays.reduce((a, p) => a + p.mood! * p.moodCount, 0) / totalMoodWeight) : null,
    checkIns: points.reduce((a, p) => a + p.moodCount, 0),
    meditationMinutes: Math.round(points.reduce((a, p) => a + p.meditationMinutes, 0)),
    meditationSessions: points.reduce((a, p) => a + p.meditationSessions, 0),
    journalEntries: points.reduce((a, p) => a + p.journalCount, 0),
    exercisesCompleted: points.reduce((a, p) => a + p.exerciseCount, 0),
    activeDays: points.filter(p => p.moodCount || p.meditationMinutes || p.journalCount || p.exerciseCount).length,
  }
}

/** Neutral description of a change between two periods; no causal claims. */
export function describeChange(current: number | null, previous: number | null, unit = ''): string {
  if (current === null || previous === null) return 'Not enough data to compare yet'
  const diff = round1(current - previous)
  if (diff === 0) return `Same as the previous period`
  return `${diff > 0 ? '+' : ''}${diff}${unit} vs previous period`
}
