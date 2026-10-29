// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { as, createDb, createUser } from './harness'

let db: PGlite
let alice: string
let bob: string

const asUser = (sub: string) => ({ role: 'authenticated' as const, sub })

beforeAll(async () => {
  db = await createDb()
  alice = await createUser(db, 'alice@example.com', { display_name: 'Alice', timezone: 'Asia/Kolkata' })
  bob = await createUser(db, 'bob@example.com', { display_name: 'Bob' })
}, 60_000)

describe('schema & seed', () => {
  it('creates a profile for each new user from signup metadata', async () => {
    const { rows } = await db.query<{ display_name: string; timezone: string }>(
      'select display_name, timezone from public.profiles where id = $1', [alice])
    expect(rows[0]).toEqual({ display_name: 'Alice', timezone: 'Asia/Kolkata' })
  })

  it('ships published meditation, exercise and affirmation content', async () => {
    const counts = await as(db, { role: 'anon' }, async tx => {
      const m = await tx.query<{ n: number }>('select count(*)::int n from public.meditation_sessions')
      const e = await tx.query<{ n: number }>('select count(*)::int n from public.exercises')
      const a = await tx.query<{ n: number }>('select count(*)::int n from public.affirmations')
      return [m.rows[0].n, e.rows[0].n, a.rows[0].n]
    })
    expect(counts[0]).toBeGreaterThanOrEqual(15)
    expect(counts[1]).toBeGreaterThanOrEqual(9)
    expect(counts[2]).toBeGreaterThanOrEqual(30)
  })

  it('covers every requested duration filter', async () => {
    const { rows } = await db.query<{ d: number }>('select distinct duration_seconds / 60 as d from public.meditation_sessions order by 1')
    expect(rows.map(r => r.d)).toEqual(expect.arrayContaining([2, 5, 10, 15, 20]))
  })
})

describe('journal privacy', () => {
  let aliceEntry: string

  beforeAll(async () => {
    aliceEntry = await as(db, asUser(alice), async tx => {
      const r = await tx.query<{ id: string }>(
        `insert into public.journal_entries (title, content, entry_type) values ('Private', 'Alice secret thoughts', 'daily') returning id`)
      return r.rows[0].id
    })
  })

  it('lets the owner read their entry', async () => {
    const rows = await as(db, asUser(alice), tx => tx.query('select id from public.journal_entries'))
    expect(rows.rows).toHaveLength(1)
  })

  it('hides it from another user', async () => {
    const rows = await as(db, asUser(bob), tx => tx.query('select * from public.journal_entries'))
    expect(rows.rows).toHaveLength(0)
  })

  it('hides it from anonymous requests', async () => {
    await expect(as(db, { role: 'anon' }, tx => tx.query('select * from public.journal_entries')))
      .rejects.toThrow(/permission denied/)
  })

  it('prevents another user from updating or deleting it', async () => {
    const upd = await as(db, asUser(bob), tx =>
      tx.query(`update public.journal_entries set content = 'hacked' where id = $1`, [aliceEntry]))
    const del = await as(db, asUser(bob), tx =>
      tx.query('delete from public.journal_entries where id = $1', [aliceEntry]))
    expect(upd.affectedRows).toBe(0)
    expect(del.affectedRows).toBe(0)
    const { rows } = await db.query<{ content: string }>('select content from public.journal_entries where id = $1', [aliceEntry])
    expect(rows[0].content).toBe('Alice secret thoughts')
  })

  it('prevents inserting rows on behalf of another user', async () => {
    await expect(as(db, asUser(bob), tx =>
      tx.query(`insert into public.journal_entries (user_id, content) values ($1, 'spoof')`, [alice])))
      .rejects.toThrow(/row-level security/)
  })

  it('prevents moving an entry to another user', async () => {
    await expect(as(db, asUser(alice), tx =>
      tx.query('update public.journal_entries set user_id = $1 where id = $2', [bob, aliceEntry])))
      .rejects.toThrow(/row-level security/)
  })

  it('does not allow linking to another user\'s mood entry', async () => {
    const bobMood = await as(db, asUser(bob), async tx =>
      (await tx.query<{ id: string }>('insert into public.mood_entries (mood_score) values (3) returning id')).rows[0].id)
    await expect(as(db, asUser(alice), tx =>
      tx.query(`insert into public.journal_entries (content, optional_mood_entry_id) values ('x', $1)`, [bobMood])))
      .rejects.toThrow(/foreign key/)
  })

  it('full-text search only returns the caller\'s entries', async () => {
    const rows = await as(db, asUser(bob), tx =>
      tx.query(`select id from public.journal_entries where search @@ websearch_to_tsquery('simple', 'secret')`))
    expect(rows.rows).toHaveLength(0)
  })
})

describe('mood entries', () => {
  it('validates mood_score range', async () => {
    await expect(as(db, asUser(alice), tx =>
      tx.query('insert into public.mood_entries (mood_score) values (9)'))).rejects.toThrow(/check constraint/)
  })

  it('keeps a linked journal entry when its mood entry is deleted', async () => {
    const { moodId, journalId } = await as(db, asUser(alice), async tx => {
      const m = await tx.query<{ id: string }>('insert into public.mood_entries (mood_score) values (4) returning id')
      const j = await tx.query<{ id: string }>(
        `insert into public.journal_entries (content, optional_mood_entry_id) values ('linked', $1) returning id`, [m.rows[0].id])
      return { moodId: m.rows[0].id, journalId: j.rows[0].id }
    })
    await as(db, asUser(alice), tx => tx.query('delete from public.mood_entries where id = $1', [moodId]))
    const { rows } = await db.query<{ user_id: string; optional_mood_entry_id: string | null }>(
      'select user_id, optional_mood_entry_id from public.journal_entries where id = $1', [journalId])
    expect(rows[0]).toEqual({ user_id: alice, optional_mood_entry_id: null })
  })
})

describe('content tables', () => {
  it('hides unpublished sessions from users and blocks non-admin writes', async () => {
    await db.query(`insert into public.meditation_sessions (slug, title, category, duration_seconds, is_published)
                    values ('draft', 'Draft', 'focus', 300, false)`)
    const visible = await as(db, asUser(alice), tx => tx.query(`select id from public.meditation_sessions where slug = 'draft'`))
    expect(visible.rows).toHaveLength(0)
    await expect(as(db, asUser(alice), tx =>
      tx.query(`insert into public.meditation_sessions (slug, title, category, duration_seconds) values ('x','x','focus',300)`)))
      .rejects.toThrow(/row-level security/)
    const upd = await as(db, asUser(alice), tx => tx.query(`update public.exercises set title = 'pwned'`))
    expect(upd.affectedRows).toBe(0)
  })

  it('allows admins (app_metadata.role) to manage content', async () => {
    const res = await as(db, { role: 'authenticated', sub: bob, appMeta: { role: 'admin' } }, tx =>
      tx.query(`update public.meditation_sessions set is_published = true where slug = 'draft'`))
    expect(res.affectedRows).toBe(1)
  })

  it('rejects history rows for unpublished content', async () => {
    await db.query(`update public.meditation_sessions set is_published = false where slug = 'draft'`)
    const { rows } = await db.query<{ id: string }>(`select id from public.meditation_sessions where slug = 'draft'`)
    await expect(as(db, asUser(alice), tx =>
      tx.query('insert into public.meditation_history (session_id) values ($1)', [rows[0].id])))
      .rejects.toThrow(/row-level security/)
  })
})

describe('meditation & exercise history', () => {
  it('records and completes a session for the owner only', async () => {
    const { rows: s } = await db.query<{ id: string }>(`select id from public.meditation_sessions where slug = 'two-minute-reset'`)
    const id = await as(db, asUser(alice), async tx =>
      (await tx.query<{ id: string }>('insert into public.meditation_history (session_id) values ($1) returning id', [s[0].id])).rows[0].id)
    const done = await as(db, asUser(alice), tx =>
      tx.query(`update public.meditation_history set completed = true, completed_at = now(), duration_completed_seconds = 120 where id = $1`, [id]))
    expect(done.affectedRows).toBe(1)
    const bobView = await as(db, asUser(bob), tx => tx.query('select * from public.meditation_history'))
    expect(bobView.rows).toHaveLength(0)
  })

  it('requires completed_at when completed', async () => {
    const { rows: s } = await db.query<{ id: string }>(`select id from public.meditation_sessions limit 1`)
    await expect(as(db, asUser(alice), tx =>
      tx.query('insert into public.meditation_history (session_id, completed) values ($1, true)', [s[0].id])))
      .rejects.toThrow(/check constraint/)
  })
})

describe('reminders', () => {
  it('validates days of week and is owner-scoped', async () => {
    await expect(as(db, asUser(alice), tx =>
      tx.query(`insert into public.reminders (reminder_type, scheduled_time, days_of_week) values ('journal', '09:00', '{7}')`)))
      .rejects.toThrow(/check constraint/)
    await as(db, asUser(alice), tx =>
      tx.query(`insert into public.reminders (reminder_type, scheduled_time, days_of_week, timezone) values ('journal', '09:00', '{1,3,5}', 'Asia/Kolkata')`))
    const bobView = await as(db, asUser(bob), tx => tx.query('select * from public.reminders'))
    expect(bobView.rows).toHaveLength(0)
  })

  it('does not let users write delivery logs', async () => {
    const { rows } = await db.query<{ id: string }>('select id from public.reminders limit 1')
    await expect(as(db, asUser(alice), tx =>
      tx.query(`insert into public.reminder_deliveries (reminder_id, user_id, channel, status, scheduled_for) values ($1, $2, 'email', 'sent', now())`, [rows[0].id, alice])))
      .rejects.toThrow(/permission denied/)
  })
})

describe('daily affirmation', () => {
  it('returns the same affirmation for the same local date', async () => {
    const first = await as(db, asUser(alice), tx => tx.query<{ id: string }>(`select * from public.get_daily_affirmation('2026-10-27')`))
    const second = await as(db, asUser(alice), tx => tx.query<{ id: string }>(`select * from public.get_daily_affirmation('2026-10-27')`))
    expect(first.rows).toHaveLength(1)
    expect(second.rows[0].id).toBe(first.rows[0].id)
  })

  it('refuses anonymous callers', async () => {
    await expect(as(db, { role: 'anon' }, tx => tx.query(`select * from public.get_daily_affirmation('2026-10-27')`)))
      .rejects.toThrow(/permission denied/)
  })
})

describe('profiles & error logs', () => {
  it('lets users read and update only their own profile', async () => {
    const own = await as(db, asUser(bob), tx => tx.query('select id from public.profiles'))
    expect(own.rows).toEqual([{ id: bob }])
    const other = await as(db, asUser(bob), tx => tx.query(`update public.profiles set display_name = 'x' where id = $1`, [alice]))
    expect(other.affectedRows).toBe(0)
  })

  it('allows inserting but never reading error logs', async () => {
    await as(db, asUser(bob), tx => tx.query(`insert into public.client_error_logs (message) values ('boom')`))
    await expect(as(db, asUser(bob), tx => tx.query('select * from public.client_error_logs')))
      .rejects.toThrow(/permission denied/)
  })
})

describe('account deletion', () => {
  it('cascades every user-owned row when the auth user is deleted', async () => {
    const carol = await createUser(db, 'carol@example.com')
    await as(db, asUser(carol), async tx => {
      const m = await tx.query<{ id: string }>('insert into public.mood_entries (mood_score) values (2) returning id')
      await tx.query(`insert into public.journal_entries (content, optional_mood_entry_id) values ('bye', $1)`, [m.rows[0].id])
      await tx.query(`insert into public.reminders (reminder_type, scheduled_time) values ('mood_checkin', '20:00')`)
      await tx.query(`select * from public.get_daily_affirmation('2026-10-27')`)
    })
    await db.query('delete from auth.users where id = $1', [carol])
    const tables = ['profiles', 'mood_entries', 'journal_entries', 'reminders', 'affirmation_history']
    for (const t of tables) {
      const col = t === 'profiles' ? 'id' : 'user_id'
      const { rows } = await db.query<{ n: number }>(`select count(*)::int n from public.${t} where ${col} = $1`, [carol])
      expect(rows[0].n, t).toBe(0)
    }
  })
})

describe('companion chat history', () => {
  it('is private to its owner, append-only and deletable', async () => {
    await as(db, asUser(alice), tx => tx.query(`insert into public.companion_messages (role, content) values ('user', 'I feel tense today')`))
    const bobView = await as(db, asUser(bob), tx => tx.query('select * from public.companion_messages'))
    expect(bobView.rows).toHaveLength(0)
    await expect(as(db, asUser(bob), tx =>
      tx.query(`insert into public.companion_messages (user_id, role, content) values ($1, 'assistant', 'spoof')`, [alice])))
      .rejects.toThrow(/row-level security/)
    const upd = await as(db, asUser(alice), tx => tx.query(`update public.companion_messages set content = 'edited'`))
    expect(upd.affectedRows).toBe(0)
    await expect(as(db, { role: 'anon' }, tx => tx.query('select * from public.companion_messages'))).rejects.toThrow(/permission denied/)
    const del = await as(db, asUser(alice), tx => tx.query('delete from public.companion_messages'))
    expect(del.affectedRows).toBe(1)
  })

  it('rejects invalid roles', async () => {
    await expect(as(db, asUser(alice), tx =>
      tx.query(`insert into public.companion_messages (role, content) values ('system', 'x')`))).rejects.toThrow(/check constraint/)
  })
})
