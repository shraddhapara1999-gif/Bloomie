import { describe, expect, it } from 'vitest'
import { activeDates, dailySeries, describeChange, moodDistribution, streaks, summarize, topEmotions, weeklyMeditation, type ActivityData } from './reports'
import { addDays, daysBetween, localDateKey, weekdayOf } from './dates'
import { breathAt, cycleLength } from './breathing'
import { elapsedMs, initialTimer, timerReducer } from './timer'
import { mayIndicateCrisis } from './crisis'
import { toCsv } from './csv'
import { readConfig } from './env'
import { journalEntrySchema, moodEntrySchema, reminderSchema, signUpSchema, resetPasswordSchema } from './validation'
import { recommendMeditations, preferredCategories } from './recommend'
import { dueOccurrence, inQuietHours, nextOccurrence, zonedTimeToUtc, localParts } from '../../supabase/functions/_shared/schedule'
import type { MeditationSession } from './types'

const empty: ActivityData = { moods: [], meditations: [], journals: [], exercises: [] }

describe('dates', () => {
  it('computes local dates in a timezone', () => {
    // 20:00 UTC on 27 Oct is 01:30 on 28 Oct in India.
    expect(localDateKey('2026-10-27T20:00:00Z', 'Asia/Kolkata')).toBe('2026-10-28')
    expect(localDateKey('2026-10-27T20:00:00Z', 'America/New_York')).toBe('2026-10-27')
    expect(localDateKey('2026-10-27T20:00:00Z', 'Not/AZone')).toBe('2026-10-27')
  })
  it('does calendar arithmetic across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
    expect(weekdayOf('2026-10-27')).toBe(2) // Tuesday
  })
})

describe('reports', () => {
  const data: ActivityData = {
    moods: [
      { mood_score: 4, entry_date: '2026-10-27', emotion_tags: ['calm', 'hopeful'], energy_level: 3, stress_level: 2 },
      { mood_score: 2, entry_date: '2026-10-27', emotion_tags: ['tired'], energy_level: 1, stress_level: 4 },
      { mood_score: 5, entry_date: '2026-10-25', emotion_tags: ['calm'], energy_level: 5, stress_level: 1 },
      { mood_score: 1, entry_date: '2026-09-01', emotion_tags: [], energy_level: null, stress_level: null }, // outside range
    ],
    meditations: [
      { duration_completed_seconds: 300, completed: true, started_at: '2026-10-27T03:00:00Z' },
      { duration_completed_seconds: 90, completed: false, started_at: '2026-10-26T18:45:00Z' }, // 27th in IST
    ],
    journals: [{ entry_date: '2026-10-26' }, { entry_date: '2026-10-26' }],
    exercises: [{ completed: true, started_at: '2026-10-24T10:00:00Z' }, { completed: false, started_at: '2026-10-24T11:00:00Z' }],
  }

  it('builds a daily series from real records only', () => {
    const s = dailySeries(data, '2026-10-27', 7, 'Asia/Kolkata')
    expect(s).toHaveLength(7)
    expect(s[0].date).toBe('2026-10-21')
    const today = s[6]
    expect(today.mood).toBe(3) // average of 4 and 2
    expect(today.energy).toBe(2)
    expect(today.moodCount).toBe(2)
    expect(today.meditationMinutes).toBe(6.5) // 5 + 1.5, bucketed by local date
    expect(today.meditationSessions).toBe(1)
    expect(s.find(p => p.date === '2026-10-26')!.journalCount).toBe(2)
    expect(s.find(p => p.date === '2026-10-24')!.exerciseCount).toBe(1)
    // Days without check-ins stay empty — never invented.
    expect(s.find(p => p.date === '2026-10-23')!.mood).toBeNull()
  })

  it('summarizes with weighted averages', () => {
    const s = summarize(dailySeries(data, '2026-10-27', 7, 'Asia/Kolkata'))
    expect(s.averageMood).toBe(3.7) // (4+2+5)/3
    expect(s.checkIns).toBe(3)
    expect(s.journalEntries).toBe(2)
    expect(s.exercisesCompleted).toBe(1)
    expect(s.activeDays).toBe(4)
    expect(summarize(dailySeries(empty, '2026-10-27', 7, 'UTC')).averageMood).toBeNull()
  })

  it('reflects deletions immediately (reports are recomputed from rows)', () => {
    const afterDelete = { ...data, moods: data.moods.filter(m => m.mood_score !== 2) }
    expect(summarize(dailySeries(afterDelete, '2026-10-27', 7, 'UTC')).averageMood).toBe(4.5)
  })

  it('computes distribution, top emotions and weekly buckets', () => {
    expect(moodDistribution(data.moods).map(d => d.count)).toEqual([1, 1, 0, 1, 1])
    expect(topEmotions(data.moods)[0]).toEqual({ tag: 'calm', count: 2 })
    const weeks = weeklyMeditation(dailySeries(data, '2026-10-27', 14, 'Asia/Kolkata'))
    expect(weeks).toHaveLength(2)
    expect(weeks[1].minutes).toBe(7)
  })

  it('describes changes without causal claims', () => {
    expect(describeChange(3.5, 3)).toBe('+0.5 vs previous period')
    expect(describeChange(null, 3)).toMatch(/Not enough data/)
    expect(describeChange(2, 2)).toMatch(/Same/)
  })
})

describe('streaks', () => {
  it('counts consecutive days and does not break before today ends', () => {
    const d = new Set(['2026-10-24', '2026-10-25', '2026-10-26'])
    expect(streaks(d, '2026-10-27')).toEqual({ current: 3, longest: 3, activeToday: false })
    d.add('2026-10-27')
    expect(streaks(d, '2026-10-27').current).toBe(4)
    expect(streaks(new Set(['2026-10-20', '2026-10-21']), '2026-10-27')).toEqual({ current: 0, longest: 2, activeToday: false })
  })
  it('ignores short abandoned meditations', () => {
    const dates = activeDates({ ...empty, meditations: [{ duration_completed_seconds: 20, completed: false, started_at: '2026-10-27T05:00:00Z' }] }, 'UTC')
    expect(dates.size).toBe(0)
  })
})

describe('breathing guide', () => {
  const box = { inhale: 4, hold: 4, exhale: 4, hold_after: 4 }
  it('walks through phases', () => {
    expect(cycleLength(box)).toBe(16)
    expect(breathAt(box, 0).phase).toBe('inhale')
    expect(breathAt(box, 2).scale).toBeCloseTo(0.5)
    expect(breathAt(box, 5).phase).toBe('hold')
    expect(breathAt(box, 9).phase).toBe('exhale')
    expect(breathAt(box, 13).phase).toBe('hold_after')
    expect(breathAt(box, 17)).toMatchObject({ phase: 'inhale', cycle: 1 })
  })
  it('skips zero-length phases', () => {
    expect(breathAt({ inhale: 4, hold: 0, exhale: 6, hold_after: 0 }, 4.5).phase).toBe('exhale')
  })
})

describe('session timer', () => {
  it('supports start, pause, resume, restart and completion', () => {
    let s = initialTimer(10_000)
    s = timerReducer(s, { type: 'start', now: 0 })
    expect(elapsedMs(s, 3000)).toBe(3000)
    s = timerReducer(s, { type: 'pause', now: 3000 })
    expect(elapsedMs(s, 60_000)).toBe(3000) // paused time doesn't count
    s = timerReducer(s, { type: 'resume', now: 60_000 })
    expect(elapsedMs(s, 62_000)).toBe(5000)
    s = timerReducer(s, { type: 'tick', now: 70_000 })
    expect(s.status).toBe('finished')
    expect(s.accumulatedMs).toBe(10_000)
    s = timerReducer(s, { type: 'restart', now: 80_000 })
    expect(s.status).toBe('running')
    expect(elapsedMs(s, 81_000)).toBe(1000)
  })
  it('records partial time when ended early', () => {
    let s = timerReducer(initialTimer(10_000), { type: 'start', now: 0 })
    s = timerReducer(s, { type: 'finish', now: 4000 })
    expect(s).toMatchObject({ status: 'finished', accumulatedMs: 4000 })
  })
  it('ignores invalid transitions', () => {
    const s = initialTimer(1000)
    expect(timerReducer(s, { type: 'pause', now: 5 })).toBe(s)
    expect(timerReducer(s, { type: 'resume', now: 5 })).toBe(s)
  })
})

describe('reminder scheduling', () => {
  const r = { scheduled_time: '09:00', days_of_week: [1, 3, 5], timezone: 'Asia/Kolkata', enabled: true }

  it('converts local wall time to UTC', () => {
    expect(zonedTimeToUtc('2026-10-28', 540, 'Asia/Kolkata').toISOString()).toBe('2026-10-28T03:30:00.000Z')
    // New York: after DST ends on 1 Nov 2026, 09:00 local is 14:00 UTC.
    expect(zonedTimeToUtc('2026-11-02', 540, 'America/New_York').toISOString()).toBe('2026-11-02T14:00:00.000Z')
    expect(zonedTimeToUtc('2026-10-30', 540, 'America/New_York').toISOString()).toBe('2026-10-30T13:00:00.000Z')
  })

  it('fires only on selected days within the window', () => {
    // Wed 28 Oct 2026 03:32 UTC = 09:02 IST
    expect(dueOccurrence(r, new Date('2026-10-28T03:32:00Z'), 5)?.toISOString()).toBe('2026-10-28T03:30:00.000Z')
    expect(dueOccurrence(r, new Date('2026-10-28T03:40:00Z'), 5)).toBeNull() // outside window
    expect(dueOccurrence(r, new Date('2026-10-27T03:32:00Z'), 5)).toBeNull() // Tuesday
    expect(dueOccurrence({ ...r, enabled: false }, new Date('2026-10-28T03:32:00Z'), 5)).toBeNull()
  })

  it('handles windows that cross local midnight', () => {
    const late = { scheduled_time: '23:58', days_of_week: [2], timezone: 'UTC', enabled: true }
    expect(dueOccurrence(late, new Date('2026-10-28T00:01:00Z'), 5)?.toISOString()).toBe('2026-10-27T23:58:00.000Z')
  })

  it('finds the next occurrence', () => {
    expect(nextOccurrence(r, new Date('2026-10-27T10:00:00Z'))?.toISOString()).toBe('2026-10-28T03:30:00.000Z')
    expect(nextOccurrence({ ...r, enabled: false }, new Date())).toBeNull()
  })

  it('respects quiet hours, including overnight ranges', () => {
    expect(inQuietHours(23 * 60, '22:00', '07:00')).toBe(true)
    expect(inQuietHours(6 * 60, '22:00', '07:00')).toBe(true)
    expect(inQuietHours(12 * 60, '22:00', '07:00')).toBe(false)
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true)
    expect(inQuietHours(13 * 60, null, null)).toBe(false)
    expect(localParts(new Date('2026-10-27T20:00:00Z'), 'Asia/Kolkata')).toEqual({ dateKey: '2026-10-28', weekday: 3, minutes: 90 })
  })
})

describe('validation', () => {
  it('validates sign up', () => {
    expect(signUpSchema.safeParse({ displayName: 'A', email: 'a@b.co', password: 'abcd1234', acceptTerms: true }).success).toBe(true)
    const bad = signUpSchema.safeParse({ displayName: '', email: 'nope', password: 'short', acceptTerms: false })
    expect(bad.success).toBe(false)
    expect(bad.error!.issues.map(i => i.path[0])).toEqual(expect.arrayContaining(['displayName', 'email', 'password', 'acceptTerms']))
    expect(resetPasswordSchema.safeParse({ password: 'abcd1234', confirm: 'abcd1235' }).success).toBe(false)
  })
  it('validates mood entries', () => {
    const base = { mood_score: 3, emotion_tags: [], energy_level: null, focus_level: null, stress_level: null, sleep_quality: null, body_signals: null, habits: null, optional_note: null, entry_date: '2026-10-27' }
    expect(moodEntrySchema.safeParse(base).success).toBe(true)
    expect(moodEntrySchema.safeParse({ ...base, mood_score: 6 }).success).toBe(false)
    expect(moodEntrySchema.safeParse({ ...base, optional_note: 'x'.repeat(2001) }).success).toBe(false)
  })
  it('validates journal entries', () => {
    const base = { title: '', content: 'Hello', entry_type: 'daily', prompt: null, tags: [], optional_mood_entry_id: null, entry_date: '2026-10-27' }
    expect(journalEntrySchema.safeParse(base).success).toBe(true)
    expect(journalEntrySchema.safeParse({ ...base, content: '   ' }).success).toBe(false)
    expect(journalEntrySchema.safeParse({ ...base, entry_type: 'diary' }).success).toBe(false)
  })
  it('validates reminders', () => {
    const base = { reminder_type: 'journal', label: '', scheduled_time: '21:30', days_of_week: [1], timezone: 'Asia/Kolkata', enabled: true, notification_channel: 'browser' }
    expect(reminderSchema.safeParse(base).success).toBe(true)
    expect(reminderSchema.safeParse({ ...base, days_of_week: [] }).success).toBe(false)
    expect(reminderSchema.safeParse({ ...base, scheduled_time: '25:00' }).success).toBe(false)
  })
})

describe('crisis detection', () => {
  it('flags concerning language', () => {
    expect(mayIndicateCrisis('I want to kill myself')).toBe(true)
    expect(mayIndicateCrisis("I don't want to live anymore")).toBe(true)
    expect(mayIndicateCrisis('thinking about self-harm again')).toBe(true)
  })
  it('does not flag ordinary entries', () => {
    expect(mayIndicateCrisis('Work was stressful but I went for a walk')).toBe(false)
    expect(mayIndicateCrisis('')).toBe(false)
    expect(mayIndicateCrisis(null)).toBe(false)
  })
})

describe('csv export', () => {
  it('escapes quotes, newlines and formula injection', () => {
    const csv = toCsv([{ a: 'x,"y"', b: '=SUM(A1)', c: ['p', 'q'], d: null }], ['a', 'b', 'c', 'd'])
    expect(csv).toBe('a,b,c,d\r\n"x,""y""",\'=SUM(A1),p; q,')
  })
})

describe('configuration', () => {
  it('reports missing environment variables instead of crashing', () => {
    expect(readConfig({})).toMatchObject({ ok: false, missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] })
    expect(readConfig({ VITE_SUPABASE_URL: 'https://your-project.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }).ok).toBe(false)
    expect(readConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }).ok).toBe(true)
  })
})

describe('recommendations', () => {
  const s = (slug: string, category: MeditationSession['category'], minutes: number) =>
    ({ id: slug, slug, title: slug, description: '', category, duration_seconds: minutes * 60, audio_url: null, difficulty: 'beginner', breathing_pattern: null, guidance: [], tags: [] }) as MeditationSession
  const sessions = [s('sleep10', 'sleep', 10), s('stress5', 'stress', 5), s('focus10', 'focus', 10), s('begin2', 'beginner', 2)]
  it('prefers stress relief after a stressful check-in', () => {
    const rec = recommendMeditations(sessions, { goals: [], preferredMinutes: 5, hour: 10, latestMood: { mood_score: 2, stress_level: 5, emotion_tags: ['anxious'] } }, 1)
    expect(rec[0].slug).toBe('stress5')
  })
  it('suggests sleep late at night and honours goals', () => {
    expect(preferredCategories({ goals: [], preferredMinutes: 10, hour: 23, latestMood: null })[0]).toBe('sleep')
    expect(recommendMeditations(sessions, { goals: ['focus'], preferredMinutes: 10, hour: 10, latestMood: null }, 1)[0].slug).toBe('focus10')
  })
})
