import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import clsx from 'clsx'
import { ArrowLeft, Heart, Pause, Play, RotateCcw, Search, Square, Volume2, VolumeX } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, Chip, EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, Segmented } from '../components/ui'
import { type AmbientKind, BreathingCircle, speak, speechSupported, stopSpeaking, useAmbientSound, useMediaSession, useSessionTimer } from '../components/player'
import { useFavorites, useMeditation, useMeditationHistory, useMeditations, useToggleFavorite, useUpdateProfile } from '../hooks/queries'
import { DURATION_FILTERS, MEDITATION_CATEGORIES } from '../lib/constants'
import { formatClockSeconds, formatMinutes } from '../lib/dates'
import { DEFAULT_PATTERN } from '../lib/breathing'
import { recommendMeditations } from '../lib/recommend'
import { saveMeditationProgress, startMeditation } from '../services/content'
import type { MeditationSession } from '../lib/types'
import { useQueryClient } from '@tanstack/react-query'

const catLabel = (c: string) => MEDITATION_CATEGORIES.find(x => x.id === c)

export function MeditationLibraryPage() {
  const { profile } = useAuth()
  const { data, isPending, error, refetch } = useMeditations()
  const favs = useFavorites()
  const history = useMeditationHistory(30)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('')
  const [dur, setDur] = useState<number | null>(null)
  const [view, setView] = useState<'all' | 'favorites' | 'recent'>('all')

  const favIds = new Set(favs.data?.filter(f => f.content_type === 'meditation').map(f => f.content_id))
  const recentIds = [...new Set((history.data ?? []).map(h => h.session_id))]

  const list = useMemo(() => {
    let l = data ?? []
    if (view === 'favorites') l = l.filter(s => favIds.has(s.id))
    if (view === 'recent') l = recentIds.map(id => l.find(s => s.id === id)).filter(Boolean) as MeditationSession[]
    if (cat) l = l.filter(s => s.category === cat)
    if (dur) l = l.filter(s => Math.round(s.duration_seconds / 60) === dur)
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      l = l.filter(s => `${s.title} ${s.description} ${s.category} ${s.tags.join(' ')}`.toLowerCase().includes(needle))
    }
    return l
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, view, cat, dur, q, favs.data, history.data])

  const prefs = profile?.onboarding_preferences
  const featured = useMemo(() => data ? recommendMeditations(data, { goals: prefs?.goals ?? [], preferredMinutes: prefs?.meditation_minutes ?? 5, latestMood: null, hour: new Date().getHours() }, 1)[0] : null, [data, prefs])

  return (
    <div>
      <PageHeader title="Meditate" subtitle="Guided sessions from 2 to 20 minutes. Go at your own pace." />
      {featured && view === 'all' && !q && !cat && !dur && (
        <Link to={`/app/meditate/${featured.slug}`} className="block glass rounded-3xl p-5 mb-5 hover:shadow-lg transition">
          <p className="text-xs font-bold uppercase tracking-wide text-primary-strong">Suggested for you</p>
          <p className="text-xl font-extrabold font-display mt-1">{featured.title}</p>
          <p className="text-sm text-muted-foreground">{formatMinutes(featured.duration_seconds)} · {catLabel(featured.category)?.label}</p>
          <span className="inline-flex items-center gap-1.5 mt-3 text-sm font-bold text-white px-4 py-2 rounded-xl" style={{ background: 'var(--cta-gradient)' }}><Play className="size-4" aria-hidden /> Begin</span>
        </Link>
      )}

      <div className="space-y-3 mb-5">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <Segmented label="Show" value={view} onChange={setView} options={[{ value: 'all', label: 'All' }, { value: 'favorites', label: 'Favourites' }, { value: 'recent', label: 'Recent' }]} />
          <label className="relative flex-1 min-w-[200px] max-w-sm">
            <span className="sr-only">Search meditations</span>
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search sessions"
              className="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm bg-white/80 border-2 border-border outline-none focus:border-primary-strong" />
          </label>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Category">
          <Chip selected={!cat} onClick={() => setCat('')}>All</Chip>
          {MEDITATION_CATEGORIES.map(c => <Chip key={c.id} className="whitespace-nowrap" selected={cat === c.id} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.emoji} {c.label}</Chip>)}
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Duration">
          {DURATION_FILTERS.map(d => <Chip key={d} selected={dur === d} onClick={() => setDur(dur === d ? null : d)}>{d} min</Chip>)}
        </div>
      </div>

      {error ? <ErrorState error={error} onRetry={() => refetch()} /> : isPending ? <LoadingBlock rows={4} /> : list.length === 0 ? (
        <EmptyState title={view === 'favorites' ? 'No favourites yet' : view === 'recent' ? 'Nothing played yet' : 'No sessions match'}
          body={view === 'favorites' ? 'Tap the heart on a session to save it here.' : 'Try a different filter or search.'}
          action={(cat || dur || q) ? <Button variant="outline" onClick={() => { setCat(''); setDur(null); setQ('') }}>Clear filters</Button> : undefined} />
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map(s => <SessionCard key={s.id} s={s} fav={favIds.has(s.id)} />)}
        </ul>
      )}
    </div>
  )
}

function SessionCard({ s, fav }: { s: MeditationSession; fav: boolean }) {
  const toggle = useToggleFavorite()
  const c = catLabel(s.category)
  return (
    <Card as="li" className="flex flex-col relative group hover:shadow-md transition">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-primary-strong">{c?.emoji} {c?.label}</span>
        <button type="button" aria-label={fav ? `Remove ${s.title} from favourites` : `Add ${s.title} to favourites`} aria-pressed={fav}
          onClick={() => toggle.mutate({ type: 'meditation', id: s.id, on: !fav })} className="relative z-10 p-1.5 -m-1.5 rounded-full hover:bg-muted">
          <Heart className={clsx('size-5', fav ? 'fill-accent text-accent-strong' : 'text-muted-foreground')} />
        </button>
      </div>
      <h3 className="font-bold mt-1">
        <Link to={`/app/meditate/${s.slug}`} className="after:absolute after:inset-0 group-hover:underline">{s.title}</Link>
      </h3>
      <p className="text-sm text-muted-foreground mt-1 flex-1">{s.description}</p>
      <p className="text-xs font-semibold mt-3 flex gap-2">
        <span className="bg-muted rounded-full px-2 py-0.5">{formatMinutes(s.duration_seconds)}</span>
        <span className="bg-muted rounded-full px-2 py-0.5 capitalize">{s.difficulty}</span>
      </p>
    </Card>
  )
}

// ─── Player ─────────────────────────────────────────────────────────────────

export function MeditationPlayerPage() {
  const { slug } = useParams()
  const { data: session, isPending, error, refetch } = useMeditation(slug)
  if (isPending) return <LoadingBlock rows={2} />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!session) return <EmptyState title="Session not found" action={<Link to="/app/meditate" className="font-bold text-primary-strong underline">Back to library</Link>} />
  return <Player session={session} />
}

function Player({ session }: { session: MeditationSession }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const updateProfile = useUpdateProfile()
  const prefs = profile?.onboarding_preferences ?? {}
  const timer = useSessionTimer(session.duration_seconds)
  const [ambient, setAmbient] = useState<AmbientKind>(prefs.ambient_sound ?? 'off')
  const [voice, setVoice] = useState<boolean>(!!prefs.speak_guidance)
  const historyId = useRef<string | null>(null)
  const [tracked, setTracked] = useState(false)
  const startingRef = useRef(false)
  const spokenRef = useRef(-1)
  const savedRef = useRef(false)
  const pattern = session.breathing_pattern ?? DEFAULT_PATTERN
  const running = timer.status === 'running'

  useAmbientSound(ambient, running)

  const persist = useCallback(async (completed: boolean) => {
    if (!historyId.current) return
    try {
      await saveMeditationProgress(historyId.current, timer.elapsed, completed)
      qc.invalidateQueries({ queryKey: ['activity'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your progress')
    }
  }, [timer.elapsed, qc])

  const begin = async () => {
    if (startingRef.current) return
    startingRef.current = true
    timer.act('start')
    try {
      const h = await startMeditation(session.id)
      historyId.current = h.id
      setTracked(true)
    } catch (e) {
      toast.error(`Your session will not be saved: ${e instanceof Error ? e.message : 'network error'}`)
    }
  }

  const pause = useCallback(() => { timer.act('pause'); stopSpeaking(); void persist(false) }, [timer, persist])
  const resume = useCallback(() => timer.act('resume'), [timer])
  useMediaSession(session.title, { play: resume, pause })

  // Spoken / on-screen guidance cues.
  const cueIndex = session.guidance.reduce((idx, c, i) => (timer.elapsed >= c.at ? i : idx), -1)
  const cue = cueIndex >= 0 ? session.guidance[cueIndex] : null
  useEffect(() => {
    if (!running || cueIndex < 0 || cueIndex === spokenRef.current) return
    spokenRef.current = cueIndex
    if (voice) speak(session.guidance[cueIndex].text)
  }, [cueIndex, running, voice, session.guidance])

  // Completion.
  useEffect(() => {
    if (timer.status === 'finished' && !savedRef.current) {
      savedRef.current = true
      stopSpeaking()
      // Only a session played to the end counts as completed; ending early saves partial minutes.
      void persist(timer.elapsed >= session.duration_seconds - 1)
    }
  }, [timer.status, timer.elapsed, session.duration_seconds, persist])

  // Save partial progress when leaving the page or hiding the tab.
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && !savedRef.current) void persistRef.current(false) }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      stopSpeaking()
      if (!savedRef.current) void persistRef.current(false)
    }
  }, [])

  const restart = () => { spokenRef.current = -1; savedRef.current = false; timer.act('restart'); if (!historyId.current) void begin() }
  const endEarly = () => { timer.act('finish') }

  const savePref = (patch: Partial<typeof prefs>) => {
    if (profile) updateProfile.mutate({ onboarding_preferences: { ...prefs, ...patch } })
  }

  if (timer.status === 'finished') {
    const fullyDone = timer.elapsed >= session.duration_seconds - 1
    return (
      <div className="max-w-md mx-auto text-center glass rounded-3xl p-6 animate-fade-up" role="status">
        <p className="text-5xl" aria-hidden>{fullyDone ? '🌸' : '🌿'}</p>
        <h1 className="text-2xl font-extrabold mt-2">{fullyDone ? 'Session complete' : 'Nicely done'}</h1>
        <p className="text-sm text-muted-foreground mt-1">You spent {formatMinutes(timer.elapsed)} with “{session.title}”. {tracked ? 'Saved to your history.' : ''}</p>
        <div className="flex flex-col gap-2 mt-5">
          <Button onClick={() => nav('/app/journal/new?type=reflection&prompt=' + encodeURIComponent('How do I feel after taking this time for myself?'))}>Reflect in journal</Button>
          <Button variant="outline" onClick={() => { historyId.current = null; startingRef.current = false; setTracked(false); restart() }}>Play again</Button>
          <Button variant="ghost" onClick={() => nav('/app/meditate')}>Back to library</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link to="/app/meditate" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong mb-3 hover:underline"><ArrowLeft className="size-4" aria-hidden /> Library</Link>
      <div className="glass rounded-3xl p-5 sm:p-7">
        <div className="text-center">
          <p className="text-xs font-semibold text-primary-strong">{catLabel(session.category)?.emoji} {catLabel(session.category)?.label} · {formatMinutes(session.duration_seconds)} · <span className="capitalize">{session.difficulty}</span></p>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">{session.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{session.description}</p>
        </div>

        <div className="my-6 flex justify-center">
          <BreathingCircle pattern={pattern} elapsed={timer.elapsed} active={timer.status !== 'idle'} />
        </div>

        <p className="min-h-[3.5rem] text-center font-display text-lg font-semibold leading-snug px-2" aria-live="polite">
          {timer.status === 'idle' ? 'Find a comfortable position. Press begin when you are ready.' : cue?.text}
        </p>

        <div className="mt-4">
          <ProgressBar value={timer.progress} label="Session progress" />
          <div className="flex justify-between text-xs font-semibold text-muted-foreground mt-1.5 tabular-nums">
            <span>{formatClockSeconds(timer.elapsed)}</span><span>-{formatClockSeconds(timer.remaining)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mt-5">
          {timer.status !== 'idle' && <Button variant="soft" onClick={restart} aria-label="Restart"><RotateCcw className="size-5" /></Button>}
          {timer.status === 'idle' && <Button size="lg" onClick={begin} className="px-10"><Play className="size-5" aria-hidden /> Begin</Button>}
          {timer.status === 'running' && <Button size="lg" onClick={pause} className="px-10"><Pause className="size-5" aria-hidden /> Pause</Button>}
          {timer.status === 'paused' && <Button size="lg" onClick={resume} className="px-10"><Play className="size-5" aria-hidden /> Resume</Button>}
          {timer.status !== 'idle' && <Button variant="soft" onClick={endEarly} aria-label="End session"><Square className="size-5" /></Button>}
        </div>

        <div className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
            {ambient === 'off' ? <VolumeX className="size-4 text-muted-foreground" aria-hidden /> : <Volume2 className="size-4 text-primary-strong" aria-hidden />}
            <span className="font-semibold">Ambient</span>
            <select value={ambient} onChange={e => { const v = e.target.value as AmbientKind; setAmbient(v); savePref({ ambient_sound: v }) }}
              className="ml-auto bg-transparent font-semibold text-primary-strong outline-none">
              <option value="off">Off</option><option value="soft-noise">Soft rain</option><option value="warm-tone">Warm tone</option>
            </select>
          </label>
          {speechSupported() && (
            <label className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2">
              <input type="checkbox" checked={voice} onChange={e => { setVoice(e.target.checked); savePref({ speak_guidance: e.target.checked }); if (!e.target.checked) stopSpeaking() }} className="size-4 accent-[var(--primary-strong)]" />
              <span className="font-semibold">Read guidance aloud</span>
            </label>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground text-center mt-4">Stop at any time if anything feels uncomfortable. Ambient sound is generated on your device; voice uses your device's built-in speech.</p>
      </div>
    </div>
  )
}
