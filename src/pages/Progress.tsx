import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, Dialog, EmptyState, ErrorState, LoadingBlock, PageHeader, SectionTitle, Segmented } from '../components/ui'
import { MoodTrendChart, SimpleBarChart } from '../components/charts'
import { useActivity, useDeleteMood, useMoodEntries, useToday } from '../hooks/queries'
import { type DayPoint, activeDates, dailySeries, describeChange, moodDistribution, streaks, summarize, topEmotions, weeklyMeditation } from '../lib/reports'
import { EMOTIONS, MOOD_LEVELS, moodLevel } from '../lib/constants'
import { addDays, formatDateKey } from '../lib/dates'
import { downloadFile, toCsv } from '../lib/csv'
import { listMoodEntries } from '../services/moods'
import type { MoodEntry } from '../lib/types'

type Range = 7 | 30 | 90

export function ProgressPage() {
  const { timezone } = useAuth()
  const today = useToday()
  const [range, setRange] = useState<Range>(30)
  // Fetch the current period plus the previous one for comparison.
  const { data, isPending, error, refetch, isFetching } = useActivity(range * 2)

  const calc = useMemo(() => {
    if (!data) return null
    const current = dailySeries(data, today, range, timezone)
    const previous = dailySeries(data, addDays(today, -range), range, timezone)
    const from = current[0].date
    const moodsInRange = data.moods.filter(m => m.entry_date >= from)
    return {
      current, previous,
      cur: summarize(current), prev: summarize(previous),
      dist: moodDistribution(moodsInRange),
      emotions: topEmotions(moodsInRange),
      streak: streaks(activeDates(data, timezone), today),
      weekly: weeklyMeditation(current),
    }
  }, [data, range, today, timezone])

  const exportCsv = () => {
    if (!calc) return
    const rows = calc.current.map(p => ({
      date: p.date, average_mood: p.mood, average_energy: p.energy, check_ins: p.moodCount,
      meditation_minutes: p.meditationMinutes, meditation_sessions_completed: p.meditationSessions,
      journal_entries: p.journalCount, exercises_completed: p.exerciseCount,
    }))
    downloadFile(`bloomie-activity-${range}d-${today}.csv`, toCsv(rows, Object.keys(rows[0]) as (keyof typeof rows[0])[]))
  }

  return (
    <div>
      <PageHeader title="Your progress" subtitle="Patterns from your own entries — no judgement, just noticing."
        action={<Segmented label="Time range" value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />} />

      {error ? <ErrorState error={error} onRetry={() => refetch()} /> : isPending || !calc ? <LoadingBlock rows={4} /> : (
        <div className={isFetching ? 'opacity-80 transition-opacity' : ''}>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Stat label="Average mood" value={calc.cur.averageMood !== null ? `${calc.cur.averageMood} / 5` : '—'} sub={describeChange(calc.cur.averageMood, calc.prev.averageMood)} />
            <Stat label="Mindful minutes" value={String(calc.cur.meditationMinutes)} sub={`${calc.cur.meditationSessions} ${calc.cur.meditationSessions === 1 ? 'session' : 'sessions'} completed`} />
            <Stat label="Journal entries" value={String(calc.cur.journalEntries)} sub={describeChange(calc.cur.journalEntries, calc.prev.journalEntries)} />
            <Stat label="Active days" value={`${calc.cur.activeDays} / ${range}`} sub={`Current rhythm ${calc.streak.current} · longest ${calc.streak.longest}`} />
          </dl>

          {calc.cur.activeDays === 0 && (
            <Card className="mb-5"><EmptyState title="Nothing recorded in this period yet" body="Your charts will fill in as you check in, meditate, journal or practise. We never fill gaps with made-up data." /></Card>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="lg:col-span-2">
              <SectionTitle>Mood &amp; energy</SectionTitle>
              <MoodTrendChart points={calc.current} height={240} />
            </Card>

            <Card>
              <SectionTitle>Meditation minutes{range === 90 ? ' by week' : ' by day'}</SectionTitle>
              {range === 90
                ? <SimpleBarChart data={calc.weekly} dataKey="minutes" name="Minutes" unit=" min" title="Meditation minutes by week" description="Total meditation minutes per week (week starting date)." emptyText="No meditation in this period yet." />
                : <SimpleBarChart data={calc.current} dataKey="meditationMinutes" name="Minutes" unit=" min" title="Meditation minutes by day" description="Meditation minutes per day." emptyText="No meditation in this period yet." />}
            </Card>

            <Card>
              <SectionTitle>Mood distribution</SectionTitle>
              <SimpleBarChart data={calc.dist.map(d => ({ label: `${MOOD_LEVELS[d.score - 1].emoji} ${MOOD_LEVELS[d.score - 1].label}`, count: d.count }))}
                dataKey="count" name="Check-ins" title="Mood distribution" description="Number of check-ins at each mood level." emptyText="No check-ins in this period yet." />
            </Card>

            <Card>
              <SectionTitle>Journal frequency</SectionTitle>
              <SimpleBarChart data={range === 90 ? groupWeekly(calc.current, 'journalCount') : calc.current} dataKey={range === 90 ? 'value' : 'journalCount'} name="Entries"
                title="Journal entries over time" description="Number of journal entries per period." emptyText="No journal entries in this period yet." />
            </Card>

            <Card>
              <SectionTitle>Exercises completed</SectionTitle>
              <SimpleBarChart data={range === 90 ? groupWeekly(calc.current, 'exerciseCount') : calc.current} dataKey={range === 90 ? 'value' : 'exerciseCount'} name="Exercises"
                title="Exercises completed over time" description="Number of exercises completed per period." emptyText="No completed exercises in this period yet." />
            </Card>

            <Card>
              <SectionTitle>Feelings you noted most</SectionTitle>
              {calc.emotions.length === 0 ? <p className="text-sm text-muted-foreground">Add feelings to your check-ins to see them here.</p> : (
                <ul className="space-y-2">
                  {calc.emotions.map(e => {
                    const info = EMOTIONS.find(x => x.id === e.tag)
                    const max = calc.emotions[0].count
                    return (
                      <li key={e.tag} className="flex items-center gap-3 text-sm">
                        <span className="w-28 shrink-0">{info?.emoji} {info?.label ?? e.tag}</span>
                        <span className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden" aria-hidden><span className="block h-full rounded-full bg-[#0a80a8]" style={{ width: `${(e.count / max) * 100}%` }} /></span>
                        <span className="w-8 text-right font-semibold tabular-nums">{e.count}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <SectionTitle>Compared with the previous {range} days</SectionTitle>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="font-semibold py-1">Measure</th><th className="font-semibold">Now</th><th className="font-semibold">Before</th></tr></thead>
                <tbody>
                  {([
                    ['Average mood', calc.cur.averageMood ?? '—', calc.prev.averageMood ?? '—'],
                    ['Check-ins', calc.cur.checkIns, calc.prev.checkIns],
                    ['Mindful minutes', calc.cur.meditationMinutes, calc.prev.meditationMinutes],
                    ['Journal entries', calc.cur.journalEntries, calc.prev.journalEntries],
                    ['Exercises', calc.cur.exercisesCompleted, calc.prev.exercisesCompleted],
                    ['Active days', calc.cur.activeDays, calc.prev.activeDays],
                  ] as const).map(([k, a, b]) => <tr key={k} className="border-t border-border"><td className="py-1.5">{k}</td><td className="font-bold">{a}</td><td className="text-muted-foreground">{b}</td></tr>)}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground mt-3">These figures describe your own activity. They don't show what caused any change in mood.</p>
            </Card>
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={exportCsv}><Download className="size-4" aria-hidden /> Export {range}-day summary (CSV)</Button>
          </div>
        </div>
      )}

      <MoodHistory />
    </div>
  )
}

function groupWeekly(points: DayPoint[], key: keyof DayPoint) {
  const out: { label: string; value: number }[] = []
  for (let end = points.length; end > 0; end -= 7) {
    const slice = points.slice(Math.max(0, end - 7), end)
    out.unshift({ label: formatDateKey(slice[0].date, { day: 'numeric', month: 'short' }), value: slice.reduce((a, p) => a + Number(p[key] ?? 0), 0) })
  }
  return out
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-extrabold font-display mt-0.5">{value}</dd>
      <dd className="text-[11px] text-muted-foreground mt-0.5">{sub}</dd>
    </div>
  )
}

function MoodHistory() {
  const [page, setPage] = useState(0)
  const { data, isPending, error } = useMoodEntries({ page, limit: 10 })
  const del = useDeleteMood()
  const [confirm, setConfirm] = useState<MoodEntry | null>(null)
  const [exporting, setExporting] = useState(false)
  const pages = Math.ceil((data?.count ?? 0) / 10)

  const exportMoods = async () => {
    setExporting(true)
    try {
      const all: MoodEntry[] = []
      for (let p = 0; ; p++) {
        const { rows } = await listMoodEntries({ page: p, limit: 500 })
        all.push(...rows)
        if (rows.length < 500) break
      }
      downloadFile(`bloomie-checkins-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all.map(m => ({
        date: m.entry_date, created_at: m.created_at, mood_score: m.mood_score, emotions: m.emotion_tags, energy: m.energy_level,
        focus: m.focus_level, stress: m.stress_level, sleep: m.sleep_quality, period_flow: m.body_signals?.period_flow ?? null,
        symptoms: m.body_signals?.symptoms ?? null, note: m.optional_note,
      })), ['date', 'created_at', 'mood_score', 'emotions', 'energy', 'focus', 'stress', 'sleep', 'period_flow', 'symptoms', 'note']))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="mt-8" aria-labelledby="checkins">
      <SectionTitle id="checkins" action={<Button variant="ghost" size="sm" loading={exporting} onClick={exportMoods}><Download className="size-4" aria-hidden /> CSV</Button>}>Check-in history</SectionTitle>
      {error ? <ErrorState error={error} /> : isPending ? <LoadingBlock rows={2} /> : !data?.rows.length ? (
        <Card><p className="text-sm text-muted-foreground">Your check-ins will be listed here.</p></Card>
      ) : (
        <>
          <ul className="bg-card rounded-2xl divide-y divide-border shadow-[var(--shadow-card)]">
            {data.rows.map(m => {
              const l = moodLevel(m.mood_score)
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-2xl" aria-hidden>{l.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{l.label}{m.emotion_tags.length ? ` · ${m.emotion_tags.map(t => EMOTIONS.find(e => e.id === t)?.label ?? t).join(', ')}` : ''}</p>
                    <p className="text-xs text-muted-foreground truncate">{formatDateKey(m.entry_date)} · {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{m.optional_note ? ` · “${m.optional_note}”` : ''}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setConfirm(m)} aria-label={`Delete check-in from ${formatDateKey(m.entry_date)}`}><Trash2 className="size-4" /></Button>
                </li>
              )
            })}
          </ul>
          {pages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-3">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Newer</Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Older</Button>
            </div>
          )}
        </>
      )}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title="Delete this check-in?"
        footer={<><Button variant="soft" onClick={() => setConfirm(null)}>Keep</Button><Button variant="danger" loading={del.isPending} onClick={() => confirm && del.mutate(confirm.id, { onSuccess: () => setConfirm(null) })}>Delete</Button></>}>
        <p>It will be removed from your history and reports. Any linked journal entry is kept.</p>
      </Dialog>
    </section>
  )
}
