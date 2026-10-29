import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import clsx from 'clsx'
import { BookHeart, ChevronRight, Clock, Flame, Heart, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Button, ButtonLink, Card, Chip, ErrorState, SectionTitle, Skeleton } from '../components/ui'
import { MoodTrendChart } from '../components/charts'
import { BloomieMascot } from '../components/brand'
import {
  useActivity, useCreateMood, useDailyAffirmation, useExercises, useFavorites, useMeditationHistory, useMeditations,
  useMoodEntries, useReminders, useToday, useToggleFavorite,
} from '../hooks/queries'
import { activeDates, dailySeries, streaks, summarize } from '../lib/reports'
import { EMOTIONS, JOURNAL_PROMPTS, MEDITATION_CATEGORIES, MOOD_LEVELS, REMINDER_TYPES, moodLevel } from '../lib/constants'
import { formatMinutes, greetingFor, localDateKey } from '../lib/dates'
import { dailyTip, recommendExercises, recommendMeditations, type RecommendContext } from '../lib/recommend'
import { nextOccurrence, localParts } from '../../supabase/functions/_shared/schedule'

export function DashboardPage() {
  const { profile, timezone, user } = useAuth()
  const today = useToday()
  const name = profile?.display_name || user?.email?.split('@')[0] || ''
  const todayMoods = useMoodEntries({ from: today, to: today, limit: 5 })
  const latest = todayMoods.data?.rows[0] ?? null
  const prefs = profile?.onboarding_preferences ?? {}
  const hour = Math.floor(localParts(new Date(), timezone).minutes / 60)
  const ctx: RecommendContext = {
    goals: prefs.goals ?? [], preferredMinutes: prefs.meditation_minutes ?? 5, hour,
    latestMood: latest ? { mood_score: latest.mood_score, stress_level: latest.stress_level, emotion_tags: latest.emotion_tags } : null,
  }
  const tip = dailyTip(ctx)

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3 animate-fade-up">
        <BloomieMascot size={52} className="shrink-0" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">{greetingFor(new Date(), timezone)}{name ? `, ${name}` : ''}</h1>
          <p className="text-sm text-muted-foreground">{new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date())}</p>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {todayMoods.isPending ? <Skeleton className="h-44" /> : todayMoods.error ? <ErrorState error={todayMoods.error} onRetry={() => todayMoods.refetch()} />
            : latest ? <TodayMood entry={latest} count={todayMoods.data!.rows.length} /> : <QuickCheckIn today={today} />}

          <Card className="!bg-[linear-gradient(135deg,#ffffff,#eef7f3)]">
            <p className="text-xs font-bold uppercase tracking-wide text-primary-strong">Today's suggestion</p>
            <h2 className="text-lg font-bold mt-1">{tip.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{tip.body}</p>
          </Card>

          <Recommended ctx={ctx} />
          <WeekSummary />
        </div>

        <div className="space-y-5">
          <AffirmationCard />
          <StreakCard />
          <TalkShortcut />
          <JournalShortcut />
          <UpcomingReminders />
          <RecentActivity />
        </div>
      </div>
    </div>
  )
}

function QuickCheckIn({ today }: { today: string }) {
  const [mood, setMood] = useState<number | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const create = useCreateMood()
  const save = async () => {
    if (!mood || create.isPending) return
    try {
      await create.mutateAsync({
        mood_score: mood, emotion_tags: tags, energy_level: null, focus_level: null, stress_level: null, sleep_quality: null,
        body_signals: null, habits: null, optional_note: null, entry_date: today,
      })
      toast.success('Check-in saved. Thank you for checking in 🌱')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }
  return (
    <section className="glass rounded-3xl p-5" aria-labelledby="quick-checkin">
      <h2 id="quick-checkin" className="text-xl font-extrabold">How are you feeling right now?</h2>
      <p className="text-sm text-muted-foreground">A quick check-in takes a few seconds.</p>
      <div className="grid grid-cols-5 gap-1 mt-4" role="radiogroup" aria-label="Overall mood">
        {MOOD_LEVELS.map(m => (
          <button key={m.score} type="button" role="radio" aria-checked={mood === m.score} aria-label={m.label} onClick={() => setMood(m.score)} className="flex flex-col items-center gap-1 py-1">
            <span aria-hidden className="w-12 h-12 sm:w-14 sm:h-14 rounded-full grid place-items-center text-2xl sm:text-3xl transition-all"
              style={{ background: mood === m.score ? m.color : '#f0f7f5', transform: mood === m.score ? 'scale(1.12)' : 'none', border: `2px solid ${mood === m.score ? m.color : 'transparent'}` }}>{m.emoji}</span>
            <span className="text-xs font-semibold">{m.label}</span>
          </button>
        ))}
      </div>
      {mood && (
        <div className="mt-4 animate-fade-up">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Any feelings to add? (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {EMOTIONS.map(e => (
              <Chip key={e.id} className="!px-2.5 !py-1 !text-xs !min-h-8" selected={tags.includes(e.id)}
                onClick={() => setTags(t => t.includes(e.id) ? t.filter(x => x !== e.id) : [...t, e.id])}>{e.emoji} {e.label}</Chip>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-4">
        <Button onClick={save} disabled={!mood} loading={create.isPending}>Save check-in</Button>
        <ButtonLink to="/app/check-in" variant="outline">Full check-in →</ButtonLink>
      </div>
    </section>
  )
}

function TodayMood({ entry, count }: { entry: { mood_score: number; emotion_tags: string[]; id: string }; count: number }) {
  const level = moodLevel(entry.mood_score)
  return (
    <section className="glass rounded-3xl p-5 flex items-center gap-4 flex-wrap" aria-label="Today's check-in">
      <span aria-hidden className="w-16 h-16 rounded-full grid place-items-center text-4xl" style={{ background: level.color }}>{level.emoji}</span>
      <div className="flex-1 min-w-[180px]">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-strong">Checked in today{count > 1 ? ` · ${count} times` : ''}</p>
        <p className="text-lg font-bold">Feeling {level.label.toLowerCase()}</p>
        {entry.emotion_tags.length > 0 && <p className="text-sm text-muted-foreground">{entry.emotion_tags.map(t => EMOTIONS.find(e => e.id === t)?.label ?? t).join(', ')}</p>}
      </div>
      <div className="flex gap-2">
        <ButtonLink to={`/app/journal/new?mood=${entry.id}&type=mood`} variant="outline">Reflect</ButtonLink>
        <ButtonLink to="/app/check-in" variant="soft">Check in again</ButtonLink>
      </div>
    </section>
  )
}

function Recommended({ ctx }: { ctx: RecommendContext }) {
  const meds = useMeditations()
  const ex = useExercises()
  const recMeds = useMemo(() => meds.data ? recommendMeditations(meds.data, ctx, 3) : [], [meds.data, ctx])
  const recEx = useMemo(() => ex.data ? recommendExercises(ex.data, ctx, 2) : [], [ex.data, ctx])
  return (
    <section aria-labelledby="for-you">
      <SectionTitle id="for-you" action={<Link to="/app/meditate" className="text-sm font-semibold text-primary-strong hover:underline">See all</Link>}>Recommended for you</SectionTitle>
      {meds.error && <ErrorState error={meds.error} onRetry={() => meds.refetch()} />}
      <div className="grid sm:grid-cols-3 gap-3">
        {meds.isPending ? [0, 1, 2].map(i => <Skeleton key={i} className="h-32" />) : recMeds.map(s => (
          <Link key={s.id} to={`/app/meditate/${s.slug}`} className="group rounded-2xl p-4 bg-card shadow-[var(--shadow-card)] hover:shadow-md transition flex flex-col">
            <span className="text-xs font-semibold text-primary-strong">
              {MEDITATION_CATEGORIES.find(c => c.id === s.category)?.emoji} {MEDITATION_CATEGORIES.find(c => c.id === s.category)?.label} · {formatMinutes(s.duration_seconds)}
            </span>
            <span className="font-bold mt-1 group-hover:underline">{s.title}</span>
            <span className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</span>
          </Link>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        {ex.isPending ? [0, 1].map(i => <Skeleton key={i} className="h-20" />) : recEx.map(e => (
          <Link key={e.id} to={`/app/exercises/${e.slug}`} className="group rounded-2xl p-4 bg-muted hover:bg-white transition flex items-center gap-3">
            <Sparkles className="size-5 text-primary-strong shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-sm group-hover:underline">{e.title}</span>
              <span className="block text-xs text-muted-foreground">{formatMinutes(e.duration_seconds)} exercise</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  )
}

function WeekSummary() {
  const { timezone } = useAuth()
  const today = useToday()
  const { data, isPending, error, refetch } = useActivity(7)
  const points = data ? dailySeries(data, today, 7, timezone) : []
  const s = summarize(points)
  return (
    <Card aria-labelledby="week">
      <SectionTitle id="week" action={<Link to="/app/progress" className="text-sm font-semibold text-primary-strong hover:underline">Full report</Link>}>This week</SectionTitle>
      {error ? <ErrorState error={error} onRetry={() => refetch()} /> : isPending ? <Skeleton className="h-48" /> : (
        <>
          <dl className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="rounded-xl bg-muted p-2"><dt className="text-[11px] text-muted-foreground font-semibold">Check-ins</dt><dd className="text-lg font-extrabold">{s.checkIns}</dd></div>
            <div className="rounded-xl bg-muted p-2"><dt className="text-[11px] text-muted-foreground font-semibold">Mindful min</dt><dd className="text-lg font-extrabold">{s.meditationMinutes}</dd></div>
            <div className="rounded-xl bg-muted p-2"><dt className="text-[11px] text-muted-foreground font-semibold">Journal</dt><dd className="text-lg font-extrabold">{s.journalEntries}</dd></div>
          </dl>
          <MoodTrendChart points={points} height={180} />
        </>
      )}
    </Card>
  )
}

function AffirmationCard() {
  const { data, isPending, error } = useDailyAffirmation()
  const favs = useFavorites()
  const toggle = useToggleFavorite()
  const isFav = !!data && !!favs.data?.some(f => f.content_type === 'affirmation' && f.content_id === data.id)
  return (
    <section className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #3b7a87, #47824c)' }} aria-labelledby="aff">
      <h2 id="aff" className="text-xs font-bold uppercase tracking-wide opacity-90">Today's affirmation</h2>
      {isPending ? <div className="h-14 mt-2 rounded-xl bg-white/20 animate-pulse" /> :
        error ? <p className="mt-2 text-sm">Couldn't load today's affirmation.</p> :
        data ? <p className="font-display font-bold text-lg mt-2 leading-snug">“{data.text}”</p> : <p className="mt-2 text-sm">No affirmations available yet.</p>}
      {data && (
        <button type="button" onClick={() => toggle.mutate({ type: 'affirmation', id: data.id, on: !isFav })} aria-pressed={isFav}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 rounded-full px-3 py-1.5">
          <Heart className={clsx('size-3.5', isFav && 'fill-white')} aria-hidden /> {isFav ? 'Saved' : 'Save'}
        </button>
      )}
    </section>
  )
}

function StreakCard() {
  const { timezone } = useAuth()
  const today = useToday()
  const { data, isPending } = useActivity(120)
  if (isPending || !data) return <Skeleton className="h-24" />
  const s = streaks(activeDates(data, timezone), today)
  return (
    <Card aria-labelledby="streak">
      <div className="flex items-center gap-3">
        <span className="size-11 rounded-full bg-[#fdeee9] grid place-items-center"><Flame className="size-5 text-accent-strong" aria-hidden /></span>
        <div>
          <h2 id="streak" className="font-bold">{s.current > 0 ? `${s.current}-day rhythm` : 'Your rhythm'}</h2>
          <p className="text-xs text-muted-foreground">
            {s.current === 0 ? 'Any small practice today starts a new rhythm. No pressure.'
              : s.activeToday ? 'You showed up today. Lovely.' : 'Whenever you are ready today. Missing a day is completely okay.'}
            {s.longest > 1 && ` Longest: ${s.longest} days.`}
          </p>
        </div>
      </div>
    </Card>
  )
}

function TalkShortcut() {
  return (
    <Link to="/app/talk" className="group flex items-center gap-3 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)] hover:shadow-md transition">
      <BloomieMascot size={44} className="shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-bold group-hover:underline">Talk to Bloomie</span>
        <span className="block text-xs text-muted-foreground">Need to talk something through? Bloomie is here.</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  )
}

function JournalShortcut() {
  const today = useToday()
  const prompt = JOURNAL_PROMPTS[Number(today.replace(/-/g, '')) % JOURNAL_PROMPTS.length]
  return (
    <Card aria-labelledby="jp">
      <h2 id="jp" className="font-bold flex items-center gap-2"><BookHeart className="size-5 text-primary-strong" aria-hidden /> Journal prompt</h2>
      <p className="text-sm mt-2 italic">“{prompt.text}”</p>
      <ButtonLink to={`/app/journal/new?prompt=${encodeURIComponent(prompt.text)}&type=${prompt.type}`} variant="outline" className="mt-3 !py-2" block>Write</ButtonLink>
    </Card>
  )
}

function UpcomingReminders() {
  const { data, isPending } = useReminders()
  const upcoming = useMemo(() => {
    const now = new Date()
    return (data ?? []).map(r => ({ r, at: nextOccurrence(r, now) })).filter(x => x.at).sort((a, b) => a.at!.getTime() - b.at!.getTime()).slice(0, 3)
  }, [data])
  return (
    <Card aria-labelledby="up">
      <SectionTitle id="up" action={<Link to="/app/reminders" className="text-sm font-semibold text-primary-strong hover:underline">Manage</Link>}>Upcoming reminders</SectionTitle>
      {isPending ? <Skeleton className="h-16" /> : upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reminders set. <Link to="/app/reminders" className="underline font-semibold text-primary-strong">Add one</Link> if it would help.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map(({ r, at }) => {
            const t = REMINDER_TYPES.find(x => x.id === r.reminder_type)
            return (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">{t?.emoji} {r.label || t?.label}</span>
                <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(at!)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function RecentActivity() {
  const { timezone } = useAuth()
  const hist = useMeditationHistory(5)
  const meds = useMeditations()
  const items = (hist.data ?? []).filter(h => h.duration_completed_seconds > 0).slice(0, 4)
  return (
    <Card aria-labelledby="recent">
      <SectionTitle id="recent">Recent sessions</SectionTitle>
      {hist.isPending ? <Skeleton className="h-16" /> : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your meditation sessions will appear here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(h => {
            const s = meds.data?.find(m => m.id === h.session_id)
            return (
              <li key={h.id} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate">{h.completed ? '✅' : '⏸️'} {s?.title ?? 'Meditation'}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatMinutes(h.duration_completed_seconds)} · {localDateKey(h.started_at, timezone).slice(5)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
