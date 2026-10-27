import { useEffect, useMemo, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import clsx from 'clsx'
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Lock, Pencil, Plus, Search, Shuffle, Trash2 } from 'lucide-react'
import { Button, ButtonLink, Card, Chip, Dialog, EmptyState, ErrorState, FormError, LoadingBlock, PageHeader, Segmented, SelectField, TextAreaField, TextField } from '../components/ui'
import { SafetyDialog } from '../components/Safety'
import { useDeleteJournal, useJournalDates, useJournalEntry, useJournalList, useMoodEntries, useSaveJournal, useToday } from '../hooks/queries'
import { JOURNAL_PAGE_SIZE, allJournalEntries } from '../services/journal'
import { JOURNAL_PROMPTS, JOURNAL_TYPES, MAX_JOURNAL, moodLevel } from '../lib/constants'
import { addDays, formatDateKey, weekdayOf } from '../lib/dates'
import { fieldErrors, journalEntrySchema } from '../lib/validation'
import { mayIndicateCrisis } from '../lib/crisis'
import { downloadFile, toCsv } from '../lib/csv'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { JournalEntry, JournalType } from '../lib/types'

const typeInfo = (t: string) => JOURNAL_TYPES.find(x => x.id === t) ?? JOURNAL_TYPES[0]

// ─── List ───────────────────────────────────────────────────────────────────

export function JournalListPage() {
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '')
  const search = params.get('q') ?? ''
  const type = (params.get('type') ?? '') as JournalType | ''
  const tag = params.get('tag') ?? ''
  const date = params.get('date') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [exporting, setExporting] = useState(false)

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  // Debounce search input into the URL.
  useEffect(() => {
    const t = setTimeout(() => { if (searchInput !== search) update({ q: searchInput }) }, 350)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const { data, isPending, error, refetch, isFetching } = useJournalList({ search, type, tag, from: date || undefined, to: date || undefined, page })
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / JOURNAL_PAGE_SIZE))
  const hasFilters = !!(search || type || tag || date)

  const exportAll = async (format: 'csv' | 'md') => {
    setExporting(true)
    try {
      const rows = await allJournalEntries()
      if (!rows.length) { toast.info('You have no journal entries to export yet.'); return }
      const stamp = new Date().toISOString().slice(0, 10)
      if (format === 'csv') {
        downloadFile(`bloomie-journal-${stamp}.csv`, toCsv(rows.map(r => ({ ...r })), ['entry_date', 'title', 'entry_type', 'tags', 'prompt', 'content', 'created_at', 'updated_at']))
      } else {
        const md = rows.map(r => `## ${r.title || 'Untitled'} — ${r.entry_date}\n\n*${typeInfo(r.entry_type).label}${r.tags.length ? ` · ${r.tags.join(', ')}` : ''}*\n\n${r.prompt ? `> ${r.prompt}\n\n` : ''}${r.content}\n`).join('\n---\n\n')
        downloadFile(`bloomie-journal-${stamp}.md`, `# My Bloomie Journal\n\n${md}`, 'text/markdown;charset=utf-8')
      }
      toast.success(`Exported ${rows.length} entries`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Journal" subtitle="A private space for your thoughts."
        action={<ButtonLink to="/app/journal/new"><Plus className="size-4" aria-hidden /> New entry</ButtonLink>} />
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-4"><Lock className="size-3.5" aria-hidden /> Only you can read your journal. It is never used for advertising or shared.</p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} />
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">Search journal</span>
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search your entries"
            className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white/80 border-2 border-border outline-none focus:border-primary-strong" />
        </label>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4" role="group" aria-label="Entry type">
        <Chip selected={!type} onClick={() => update({ type: '' })}>All types</Chip>
        {JOURNAL_TYPES.map(t => <Chip key={t.id} className="whitespace-nowrap" selected={type === t.id} onClick={() => update({ type: type === t.id ? '' : t.id })}>{t.emoji} {t.label}</Chip>)}
      </div>
      {(tag || date) && (
        <div className="flex flex-wrap gap-2 mb-4 text-sm">
          {tag && <Chip selected onClick={() => update({ tag: '' })}>#{tag} ✕</Chip>}
          {date && <Chip selected onClick={() => update({ date: '' })}>{formatDateKey(date)} ✕</Chip>}
        </div>
      )}

      {view === 'calendar' && <JournalCalendar selected={date} onSelect={d => { update({ date: d === date ? '' : d }); setView('list') }} />}

      {view === 'list' && (error ? <ErrorState error={error} onRetry={() => refetch()} /> : isPending ? <LoadingBlock rows={4} /> : data!.rows.length === 0 ? (
        <EmptyState title={hasFilters ? 'No entries match' : 'Your journal is waiting'}
          body={hasFilters ? 'Try a different search or filter.' : 'Write a few words about your day, or start from a gentle prompt.'}
          action={hasFilters ? <Button variant="outline" onClick={() => { setSearchInput(''); setParams({}, { replace: true }) }}>Clear filters</Button> : <ButtonLink to="/app/journal/new">Write your first entry</ButtonLink>} />
      ) : (
        <>
          <ul className={clsx('space-y-3 transition-opacity', isFetching && 'opacity-70')} aria-busy={isFetching}>
            {data!.rows.map(e => <EntryCard key={e.id} e={e} onTag={t => update({ tag: t })} />)}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3 mt-5" aria-label="Pagination">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}><ChevronLeft className="size-4" aria-hidden /> Newer</Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => update({ page: String(page + 1) })}>Older <ChevronRight className="size-4" aria-hidden /></Button>
            </nav>
          )}
        </>
      ))}

      <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
        <Download className="size-4 text-muted-foreground" aria-hidden /><span className="text-muted-foreground">Export all entries:</span>
        <Button variant="ghost" size="sm" loading={exporting} onClick={() => exportAll('md')}>Markdown</Button>
        <Button variant="ghost" size="sm" loading={exporting} onClick={() => exportAll('csv')}>CSV</Button>
      </div>
    </div>
  )
}

function EntryCard({ e, onTag }: { e: JournalEntry; onTag: (t: string) => void }) {
  const t = typeInfo(e.entry_type)
  return (
    <Card as="li" className="relative group hover:shadow-md transition">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground font-semibold">
        <span>{t.emoji} {t.label}</span>
        <time dateTime={e.entry_date}>{formatDateKey(e.entry_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</time>
      </div>
      <h2 className="font-bold mt-1"><Link to={`/app/journal/${e.id}`} className="after:absolute after:inset-0 group-hover:underline">{e.title || 'Untitled entry'}</Link></h2>
      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{e.content}</p>
      {e.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {e.tags.map(tag => <button key={tag} type="button" onClick={() => onTag(tag)} className="relative z-10 text-xs font-semibold bg-muted rounded-full px-2 py-0.5 hover:bg-secondary">#{tag}</button>)}
        </div>
      )}
    </Card>
  )
}

function JournalCalendar({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
  const today = useToday()
  const [month, setMonth] = useState(today.slice(0, 7))
  const first = `${month}-01`
  const nextMonth = addDays(first, 32).slice(0, 7)
  const last = addDays(`${nextMonth}-01`, -1)
  const { data, isPending } = useJournalDates(first, last)
  const lead = weekdayOf(first)
  const days = Number(last.slice(8))
  const shift = (n: number) => setMonth(addDays(n < 0 ? addDays(first, -1) : `${nextMonth}-01`, 0).slice(0, 7))
  return (
    <Card className="mb-5" aria-label="Journal calendar">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="size-4" /></Button>
        <h2 className="font-bold" aria-live="polite">{formatDateKey(first, { month: 'long', year: 'numeric' })}</h2>
        <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next month" disabled={month >= today.slice(0, 7)}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground mb-1" aria-hidden>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className={clsx('grid grid-cols-7 gap-1', isPending && 'opacity-60')}>
        {Array.from({ length: lead }).map((_, i) => <div key={`l${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, '0')}`
          const n = data?.[key] ?? 0
          return (
            <button key={key} type="button" disabled={!n} onClick={() => onSelect(key)}
              aria-label={`${formatDateKey(key, { day: 'numeric', month: 'long' })}: ${n ? `${n} ${n === 1 ? 'entry' : 'entries'}` : 'no entries'}`}
              className={clsx('aspect-square rounded-xl text-sm font-semibold flex flex-col items-center justify-center transition',
                n ? 'bg-secondary hover:bg-primary hover:text-white' : 'text-muted-foreground', selected === key && 'ring-2 ring-primary-strong', key === today && 'border-2 border-primary-strong')}>
              {i + 1}
              {n > 0 && <span className="size-1.5 rounded-full bg-primary-strong mt-0.5" aria-hidden />}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">Tap a highlighted day to see its entries.</p>
    </Card>
  )
}

// ─── Editor ─────────────────────────────────────────────────────────────────

export function JournalEditorPage() {
  const { id } = useParams()
  const existing = useJournalEntry(id)
  if (id && existing.isPending) return <LoadingBlock rows={3} />
  if (id && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />
  if (id && !existing.data) return <EmptyState title="Entry not found" action={<ButtonLink to="/app/journal">Back to journal</ButtonLink>} />
  return <JournalEditor entry={existing.data ?? null} />
}

function JournalEditor({ entry }: { entry: JournalEntry | null }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const today = useToday()
  const save = useSaveJournal()
  const { profile } = useAuth()
  const [aiBusy, setAiBusy] = useState(false)
  const [aiPrompt, setAiPrompt] = useState(false)
  const recentMoods = useMoodEntries({ from: addDays(today, -6), to: today, limit: 10 })
  const initialPrompt = entry?.prompt ?? params.get('prompt')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [type, setType] = useState<JournalType>(entry?.entry_type ?? (params.get('type') as JournalType) ?? 'daily')
  const [prompt, setPrompt] = useState<string | null>(initialPrompt)
  const [tags, setTags] = useState<string[]>(entry?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [date, setDate] = useState(entry?.entry_date ?? today)
  const [moodId, setMoodId] = useState<string | null>(entry?.optional_mood_entry_id ?? params.get('mood'))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [safety, setSafety] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = !saved && (content !== (entry?.content ?? '') || title !== (entry?.title ?? ''))

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }
    window.addEventListener('beforeunload', fn)
    return () => window.removeEventListener('beforeunload', fn)
  }, [dirty])

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '').toLowerCase().slice(0, 30)
    if (t && !tags.includes(t) && tags.length < 20) setTags([...tags, t])
    setTagInput('')
  }

  const shufflePrompt = () => {
    const pool = JOURNAL_PROMPTS.filter(p => p.text !== prompt)
    const p = pool[Math.floor(Math.random() * pool.length)]
    setPrompt(p.text)
    if (!content) setType(p.type)
  }

  const askAi = async () => {
    setAiBusy(true)
    try {
      const { data, error } = await supabase!.functions.invoke('ai-journal-prompt', { method: 'POST', body: {} })
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(body?.error ?? 'AI prompts are not available right now.')
      }
      setPrompt(data.prompt); setAiPrompt(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI prompts are not available right now.')
    } finally {
      setAiBusy(false)
    }
  }

  const submit = async () => {
    if (save.isPending) return
    const input = { title, content, entry_type: type, prompt, tags, optional_mood_entry_id: moodId, entry_date: date }
    const parsed = journalEntrySchema.safeParse(input)
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
    setErrors({})
    try {
      const saved = await save.mutateAsync({ id: entry?.id, input: parsed.data })
      setSaved(true)
      toast.success(entry ? 'Entry updated' : 'Entry saved')
      if (mayIndicateCrisis(content)) setSafety(true)
      else nav(`/app/journal/${saved.id}`, { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your entry. Your text is still here.')
    }
  }

  const moods = recentMoods.data?.rows ?? []
  return (
    <div className="max-w-2xl mx-auto">
      <Link to={entry ? `/app/journal/${entry.id}` : '/app/journal'} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong mb-3 hover:underline"><ArrowLeft className="size-4" aria-hidden /> {entry ? 'Back to entry' : 'Journal'}</Link>
      <h1 className="text-2xl font-extrabold mb-4">{entry ? 'Edit entry' : 'New entry'}</h1>
      <form className="space-y-4" noValidate onSubmit={e => { e.preventDefault(); void submit() }}>
        <div className="rounded-2xl bg-white/70 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-primary-strong">Prompt</p>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => { shufflePrompt(); setAiPrompt(false) }}><Shuffle className="size-3.5" aria-hidden /> {prompt ? 'Another' : 'Give me a prompt'}</Button>
              {profile?.ai_opt_in && <Button type="button" variant="ghost" size="sm" loading={aiBusy} onClick={askAi}>✨ AI prompt</Button>}
              {prompt && <Button type="button" variant="ghost" size="sm" onClick={() => { setPrompt(null); setAiPrompt(false) }}>Remove</Button>}
            </div>
          </div>
          {prompt ? <><p className="font-display font-semibold text-lg mt-1">{prompt}</p>{aiPrompt && <p className="text-[11px] text-muted-foreground mt-1">Suggested by AI from your focus areas and recent feelings. Your journal text was not shared.</p>}</> : <p className="text-sm text-muted-foreground">Free writing — or pick a prompt for inspiration.</p>}
        </div>

        <TextField label="Title" optional value={title} onChange={e => setTitle(e.target.value)} maxLength={200} error={errors.title} placeholder="Give it a name" />
        <TextAreaField label="Your thoughts" rows={10} value={content} onChange={e => setContent(e.target.value)} maxLength={MAX_JOURNAL} error={errors.content}
          placeholder="Write freely. There's no right or wrong here." hint={<span className="flex justify-between"><span><Lock className="inline size-3" aria-hidden /> Private to you</span><span>{content.length.toLocaleString()} / {MAX_JOURNAL.toLocaleString()}</span></span>} />

        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField label="Type" value={type} onChange={e => setType(e.target.value as JournalType)}>
            {JOURNAL_TYPES.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
          </SelectField>
          <TextField label="Date" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} error={errors.entry_date} />
        </div>

        <div>
          <label htmlFor="tag-input" className="block text-sm font-semibold mb-1.5">Tags <span className="font-normal text-muted-foreground">(optional)</span></label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map(t => <button key={t} type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="text-xs font-semibold bg-secondary rounded-full px-2.5 py-1" aria-label={`Remove tag ${t}`}>#{t} ✕</button>)}
          </div>
          <div className="flex gap-2">
            <input id="tag-input" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }}
              placeholder="e.g. work, family, sleep" className="flex-1 rounded-xl px-3.5 py-2.5 text-sm bg-muted border-2 border-border outline-none focus:border-primary-strong" />
            <Button type="button" variant="soft" onClick={addTag} disabled={!tagInput.trim()}>Add</Button>
          </div>
          {errors.tags && <p className="text-xs text-danger mt-1">{errors.tags}</p>}
        </div>

        {moods.length > 0 && (
          <SelectField label="Link to a mood check-in (optional)" value={moodId ?? ''} onChange={e => setMoodId(e.target.value || null)}>
            <option value="">No link</option>
            {moods.map(m => (
              <option key={m.id} value={m.id}>{moodLevel(m.mood_score).emoji} {moodLevel(m.mood_score).label} — {formatDateKey(m.entry_date)} {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</option>
            ))}
          </SelectField>
        )}

        <FormError message={save.error?.message} />
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="soft" onClick={() => nav(-1)}>Cancel</Button>
          <Button type="submit" loading={save.isPending}>{entry ? 'Save changes' : 'Save entry'}</Button>
        </div>
      </form>

      <Dialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Leave without saving?"
        footer={<><Button variant="soft" onClick={() => blocker.reset?.()}>Keep writing</Button><Button variant="danger" onClick={() => blocker.proceed?.()}>Discard</Button></>}>
        <p>Your changes to this entry haven't been saved.</p>
      </Dialog>
      <SafetyDialog open={safety} onClose={() => { setSafety(false); nav('/app/journal', { replace: true }) }} />
    </div>
  )
}

// ─── Detail ─────────────────────────────────────────────────────────────────

export function JournalDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: e, isPending, error, refetch } = useJournalEntry(id)
  const del = useDeleteJournal()
  const [confirm, setConfirm] = useState(false)
  const linkedMood = useMoodEntries({ from: e?.entry_date, to: e?.entry_date, limit: 20 })
  const mood = useMemo(() => linkedMood.data?.rows.find(m => m.id === e?.optional_mood_entry_id), [linkedMood.data, e])

  if (isPending) return <LoadingBlock rows={3} />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!e) return <EmptyState title="Entry not found" body="It may have been deleted." action={<ButtonLink to="/app/journal">Back to journal</ButtonLink>} />
  const t = typeInfo(e.entry_type)

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/app/journal" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong mb-3 hover:underline"><ArrowLeft className="size-4" aria-hidden /> Journal</Link>
      <article className="bg-card rounded-3xl p-5 sm:p-7 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
          <span>{t.emoji} {t.label}</span>
          <time dateTime={e.entry_date}>{formatDateKey(e.entry_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</time>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">{e.title || 'Untitled entry'}</h1>
        {e.prompt && <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm italic">{e.prompt}</p>}
        <div className="mt-4 text-base leading-relaxed whitespace-pre-wrap break-words">{e.content}</div>
        {e.tags.length > 0 && <div className="flex flex-wrap gap-1.5 mt-5">{e.tags.map(tag => <Link key={tag} to={`/app/journal?tag=${encodeURIComponent(tag)}`} className="text-xs font-semibold bg-muted rounded-full px-2.5 py-1 hover:bg-secondary">#{tag}</Link>)}</div>}
        {mood && <p className="text-sm mt-4 text-muted-foreground">Linked check-in: {moodLevel(mood.mood_score).emoji} {moodLevel(mood.mood_score).label}</p>}
        <p className="text-[11px] text-muted-foreground mt-5">{e.updated_at !== e.created_at ? `Edited ${new Date(e.updated_at).toLocaleString()}` : `Written ${new Date(e.created_at).toLocaleString()}`}</p>
        <div className="flex gap-2 mt-5 justify-end">
          <Button variant="soft" onClick={() => setConfirm(true)}><Trash2 className="size-4" aria-hidden /> Delete</Button>
          <ButtonLink to={`/app/journal/${e.id}/edit`}><Pencil className="size-4" aria-hidden /> Edit</ButtonLink>
        </div>
      </article>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Delete this entry?"
        footer={<><Button variant="soft" onClick={() => setConfirm(false)}>Keep it</Button>
          <Button variant="danger" loading={del.isPending} onClick={async () => {
            try { await del.mutateAsync(e.id); toast.success('Entry deleted'); nav('/app/journal', { replace: true }) }
            catch (err) { toast.error(err instanceof Error ? err.message : 'Could not delete') }
          }}>Delete permanently</Button></>}>
        <p>This permanently removes the entry. It can't be undone.</p>
      </Dialog>
    </div>
  )
}

