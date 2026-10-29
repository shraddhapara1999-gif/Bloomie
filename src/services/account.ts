import { addDays } from '../lib/dates'
import { check, db, supabase } from '../lib/supabase'
import type { ActivityData } from '../lib/reports'

/** Fetch the user's activity between two local dates (inclusive). */
export async function fetchActivity(fromKey: string, toKey: string): Promise<ActivityData> {
  // Timestamp-based tables are fetched with a day of padding either side and
  // bucketed into local dates by the report functions.
  const fromTs = `${addDays(fromKey, -1)}T00:00:00Z`
  const toTs = `${addDays(toKey, 2)}T00:00:00Z`
  const [moods, meditations, journals, exercises] = await Promise.all([
    db().from('mood_entries').select('mood_score, entry_date, emotion_tags, energy_level, stress_level')
      .gte('entry_date', fromKey).lte('entry_date', toKey).limit(5000),
    db().from('meditation_history').select('duration_completed_seconds, completed, started_at')
      .gte('started_at', fromTs).lt('started_at', toTs).limit(5000),
    db().from('journal_entries').select('entry_date').gte('entry_date', fromKey).lte('entry_date', toKey).limit(5000),
    db().from('exercise_history').select('completed, started_at').gte('started_at', fromTs).lt('started_at', toTs).limit(5000),
  ])
  return {
    moods: check(moods) as ActivityData['moods'],
    meditations: check(meditations) as ActivityData['meditations'],
    journals: check(journals) as ActivityData['journals'],
    exercises: check(exercises) as ActivityData['exercises'],
  }
}

const EXPORT_TABLES = [
  'profiles', 'mood_entries', 'journal_entries', 'meditation_history', 'exercise_history',
  'reminders', 'reminder_deliveries', 'user_favorites', 'affirmation_history', 'companion_messages',
] as const

/** Everything stored about the user (RLS limits each query to their own rows). */
export async function exportAllData(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), format: 'bloomie-export-v1' }
  for (const t of EXPORT_TABLES) {
    const rows: unknown[] = []
    for (let page = 0; ; page++) {
      const batch = check(await db().from(t).select('*').range(page * 1000, page * 1000 + 999)) as unknown[]
      rows.push(...batch)
      if (batch.length < 1000) break
    }
    out[t] = t === 'profiles' ? (rows as Record<string, unknown>[]).map(({ unsubscribe_token: _t, ...r }) => r) : rows
  }
  return out
}

/** Permanently delete the account via the server-side `delete-account` function. */
export async function deleteAccount(): Promise<void> {
  if (!supabase) throw new Error('Not connected')
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST', body: { confirm: true } })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404) {
      throw new Error('Account deletion is not set up on the server yet (the delete-account function is not deployed). Please contact support.')
    }
    throw new Error('We could not delete your account right now. Please try again or contact support.')
  }
  await supabase.auth.signOut({ scope: 'local' })
}

export async function logClientError(message: string, route: string, release: string) {
  if (!supabase) return
  try {
    // Only an error message and route are recorded — never form contents.
    await supabase.from('client_error_logs').insert({
      message: message.slice(0, 500), route: route.slice(0, 200), release: release.slice(0, 40),
    })
  } catch {
    // Logging must never break the app.
  }
}
