import { check, db } from '../lib/supabase'
import type { JournalEntry, JournalType } from '../lib/types'
import { journalEntrySchema, type JournalEntryInput } from '../lib/validation'

export const JOURNAL_PAGE_SIZE = 15

export interface JournalFilters {
  search?: string
  type?: JournalType | ''
  tag?: string
  from?: string
  to?: string
  page?: number
}

export async function listJournalEntries(f: JournalFilters = {}) {
  const page = f.page ?? 0
  let q = db().from('journal_entries')
    .select('id, title, content, entry_type, tags, entry_date, created_at, updated_at, optional_mood_entry_id, prompt, user_id', { count: 'exact' })
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false })
    .range(page * JOURNAL_PAGE_SIZE, page * JOURNAL_PAGE_SIZE + JOURNAL_PAGE_SIZE - 1)
  if (f.search?.trim()) q = q.textSearch('search', f.search.trim(), { type: 'websearch', config: 'simple' })
  if (f.type) q = q.eq('entry_type', f.type)
  if (f.tag) q = q.contains('tags', [f.tag])
  if (f.from) q = q.gte('entry_date', f.from)
  if (f.to) q = q.lte('entry_date', f.to)
  const res = await q
  return { rows: check(res) as JournalEntry[], count: res.count ?? 0 }
}

/** Dates in [from, to] that have at least one entry (for the calendar view). */
export async function journalDates(from: string, to: string): Promise<Record<string, number>> {
  const rows = check(await db().from('journal_entries').select('entry_date').gte('entry_date', from).lte('entry_date', to)) as { entry_date: string }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.entry_date] = (out[r.entry_date] ?? 0) + 1
  return out
}

export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  return check(await db().from('journal_entries').select('*').eq('id', id).maybeSingle()) as JournalEntry | null
}

export async function createJournalEntry(input: JournalEntryInput): Promise<JournalEntry> {
  const parsed = journalEntrySchema.parse(input)
  return check(await db().from('journal_entries').insert(parsed).select('*').single()) as JournalEntry
}

export async function updateJournalEntry(id: string, input: JournalEntryInput): Promise<JournalEntry> {
  const parsed = journalEntrySchema.parse(input)
  return check(await db().from('journal_entries').update(parsed).eq('id', id).select('*').single()) as JournalEntry
}

export async function deleteJournalEntry(id: string): Promise<void> {
  check(await db().from('journal_entries').delete().eq('id', id))
}

export async function allJournalEntries(): Promise<JournalEntry[]> {
  const out: JournalEntry[] = []
  for (let page = 0; ; page++) {
    const rows = check(await db().from('journal_entries').select('*')
      .order('entry_date', { ascending: false }).range(page * 500, page * 500 + 499)) as JournalEntry[]
    out.push(...rows)
    if (rows.length < 500) return out
  }
}
