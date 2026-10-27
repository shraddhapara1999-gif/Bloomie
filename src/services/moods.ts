import { check, db } from '../lib/supabase'
import type { MoodEntry } from '../lib/types'
import { moodEntrySchema, type MoodEntryInput } from '../lib/validation'

export async function createMoodEntry(input: MoodEntryInput): Promise<MoodEntry> {
  const parsed = moodEntrySchema.parse(input)
  return check(await db().from('mood_entries').insert(parsed).select('*').single()) as MoodEntry
}

export async function deleteMoodEntry(id: string): Promise<void> {
  check(await db().from('mood_entries').delete().eq('id', id))
}

export async function listMoodEntries(opts: { from?: string; to?: string; limit?: number; page?: number } = {}) {
  const limit = opts.limit ?? 30
  const page = opts.page ?? 0
  let q = db().from('mood_entries').select('*', { count: 'exact' })
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1)
  if (opts.from) q = q.gte('entry_date', opts.from)
  if (opts.to) q = q.lte('entry_date', opts.to)
  const res = await q
  return { rows: check(res) as MoodEntry[], count: res.count ?? 0 }
}
