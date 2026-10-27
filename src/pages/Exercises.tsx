import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import clsx from 'clsx'
import { ArrowLeft, Check, ChevronRight, Heart, Pause, Play, SkipForward } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, Chip, EmptyState, ErrorState, LoadingBlock, PageHeader, ProgressBar, Switch, TextAreaField } from '../components/ui'
import { BreathingCircle, useSessionTimer } from '../components/player'
import { HelplineList } from '../components/Safety'
import { useExercise, useExerciseHistory, useExercises, useFavorites, useToggleFavorite, useUpdateProfile } from '../hooks/queries'
import { finishExercise, saveExerciseReflection, startExercise } from '../services/content'
import { formatClockSeconds, formatMinutes, localDateKey, formatDateKey } from '../lib/dates'
import { mayIndicateCrisis } from '../lib/crisis'
import type { Exercise } from '../lib/types'

const CATS: Record<string, string> = {
  breathing: '🌬️ Breathing', grounding: '🪨 Grounding', body: '🫶 Body', gratitude: '🌸 Gratitude',
  reflection: '🪞 Reflection', relaxation: '🛁 Relaxation', mindfulness: '🍃 Mindfulness', sleep: '🌙 Sleep',
}

export function ExerciseLibraryPage() {
  const { timezone } = useAuth()
  const { data, isPending, error, refetch } = useExercises()
  const history = useExerciseHistory(20)
  const favs = useFavorites()
  const [cat, setCat] = useState('')
  const favIds = new Set(favs.data?.filter(f => f.content_type === 'exercise').map(f => f.content_id))
  const cats = useMemo(() => [...new Set((data ?? []).map(e => e.category))], [data])
  const list = (data ?? []).filter(e => !cat || e.category === cat)
  const completed = (history.data ?? []).filter(h => h.completed || h.stopped_early).slice(0, 6)

  return (
    <div>
      <PageHeader title="Practice" subtitle="Short, guided exercises for calm, grounding and reflection." />
      <p className="text-xs text-muted-foreground mb-4 rounded-xl bg-white/60 px-3 py-2">These are general wellbeing exercises, not medical treatment. Stop any exercise if it feels uncomfortable.</p>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5" role="group" aria-label="Category">
        <Chip selected={!cat} onClick={() => setCat('')}>All</Chip>
        {cats.map(c => <Chip key={c} className="whitespace-nowrap" selected={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{CATS[c] ?? c}</Chip>)}
      </div>
      {error ? <ErrorState error={error} onRetry={() => refetch()} /> : isPending ? <LoadingBlock rows={4} /> : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map(e => <ExerciseCard key={e.id} e={e} fav={favIds.has(e.id)} />)}
        </ul>
      )}
      <section className="mt-8" aria-labelledby="hist">
        <h2 id="hist" className="font-bold text-lg mb-3">Your recent practice</h2>
        {history.isPending ? <LoadingBlock rows={1} /> : completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Completed exercises will appear here.</p>
        ) : (
          <ul className="bg-card rounded-2xl divide-y divide-border shadow-[var(--shadow-card)]">
            {completed.map(h => {
              const e = data?.find(x => x.id === h.exercise_id)
              return (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span aria-hidden>{h.completed ? '✅' : '🌿'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold block truncate">{e?.title ?? 'Exercise'}</span>
                    {h.reflection && <span className="text-xs text-muted-foreground block truncate">“{h.reflection}”</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{h.completed ? 'Completed' : 'Stopped'} · {formatDateKey(localDateKey(h.started_at, timezone))}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function ExerciseCard({ e, fav }: { e: Exercise; fav: boolean }) {
  const toggle = useToggleFavorite()
  return (
    <Card as="li" className="relative group flex flex-col hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold text-primary-strong">{CATS[e.category] ?? e.category}</span>
        <button type="button" aria-pressed={fav} aria-label={fav ? `Remove ${e.title} from favourites` : `Add ${e.title} to favourites`}
          onClick={() => toggle.mutate({ type: 'exercise', id: e.id, on: !fav })} className="relative z-10 p-1.5 -m-1.5 rounded-full hover:bg-muted">
          <Heart className={clsx('size-5', fav ? 'fill-accent text-accent-strong' : 'text-muted-foreground')} />
        </button>
      </div>
      <h3 className="font-bold mt-1"><Link to={`/app/exercises/${e.slug}`} className="after:absolute after:inset-0 group-hover:underline">{e.title}</Link></h3>
      <p className="text-sm text-muted-foreground mt-1 flex-1">{e.description}</p>
      <p className="text-xs font-semibold mt-3 flex items-center justify-between">
        <span className="bg-muted rounded-full px-2 py-0.5">{formatMinutes(e.duration_seconds)} · {e.instructions.length} steps</span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </p>
    </Card>
  )
}

export function ExercisePlayerPage() {
  const { slug } = useParams()
  const { data, isPending, error, refetch } = useExercise(slug)
  if (isPending) return <LoadingBlock rows={2} />
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />
  if (!data) return <EmptyState title="Exercise not found" action={<Link to="/app/exercises" className="font-bold underline text-primary-strong">Back to exercises</Link>} />
  return <ExercisePlayer exercise={data} />
}

type Phase = 'intro' | 'active' | 'done' | 'stopped'

function ExercisePlayer({ exercise }: { exercise: Exercise }) {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const updateProfile = useUpdateProfile()
  const [phase, setPhase] = useState<Phase>('intro')
  const [stepIdx, setStepIdx] = useState(0)
  const [gentle, setGentle] = useState(!!profile?.onboarding_preferences?.gentle_breathing)
  const [reflection, setReflection] = useState('')
  const [reflectionSaved, setReflectionSaved] = useState(false)
  const [savingReflection, setSavingReflection] = useState(false)
  const historyId = useRef<string | null>(null)
  const steps = exercise.instructions
  const step = steps[stepIdx]
  const timer = useSessionTimer(step?.seconds ?? 0, stepIdx)
  const hasGentle = steps.some(s => s.gentle)
  const prior = steps.slice(0, stepIdx).reduce((a, s) => a + s.seconds, 0)
  const overall = (prior + timer.elapsed) / Math.max(1, exercise.duration_seconds)

  const complete = async (stoppedEarly: boolean) => {
    setPhase(stoppedEarly ? 'stopped' : 'done')
    if (!historyId.current) return
    try {
      await finishExercise(historyId.current, { completed: !stoppedEarly, stopped_early: stoppedEarly })
      qc.invalidateQueries({ queryKey: ['activity'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  // Auto-advance when a step's timer finishes.
  useEffect(() => {
    if (phase !== 'active' || timer.status !== 'finished') return
    if (stepIdx < steps.length - 1) setStepIdx(i => i + 1)
    else void complete(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status, phase])

  // Start each new step automatically.
  useEffect(() => {
    if (phase === 'active' && timer.status === 'idle') timer.act('start')
  }, [stepIdx, phase, timer])

  const start = async () => {
    setPhase('active')
    try {
      historyId.current = (await startExercise(exercise.id)).id
    } catch (e) {
      toast.error(`Progress will not be saved: ${e instanceof Error ? e.message : 'network error'}`)
    }
  }

  const skip = () => {
    if (stepIdx < steps.length - 1) setStepIdx(i => i + 1)
    else void complete(false)
  }

  const saveReflection = async () => {
    if (!historyId.current || !reflection.trim() || savingReflection) return
    setSavingReflection(true)
    try {
      await saveExerciseReflection(historyId.current, reflection.trim())
      setReflectionSaved(true)
      qc.invalidateQueries({ queryKey: ['activity'] })
      toast.success('Reflection saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSavingReflection(false)
    }
  }

  const back = <Link to="/app/exercises" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong mb-3 hover:underline"><ArrowLeft className="size-4" aria-hidden /> Exercises</Link>

  if (phase === 'intro') {
    return (
      <div className="max-w-xl mx-auto">{back}
        <div className="glass rounded-3xl p-5 sm:p-7">
          <p className="text-xs font-semibold text-primary-strong">{CATS[exercise.category]} · {formatMinutes(exercise.duration_seconds)}</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">{exercise.title}</h1>
          <p className="text-sm mt-2">{exercise.description}</p>
          <div className="rounded-2xl bg-white/70 p-4 mt-4">
            <h2 className="font-bold text-sm">Why it may help</h2>
            <p className="text-sm text-muted-foreground mt-1">{exercise.purpose}</p>
          </div>
          <h2 className="font-bold text-sm mt-5 mb-2">Steps</h2>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="size-6 shrink-0 rounded-full bg-primary-strong text-white text-xs font-bold grid place-items-center">{i + 1}</span>
                <span><strong>{s.title}</strong> <span className="text-muted-foreground">· {formatMinutes(s.seconds)}</span><br /><span className="text-muted-foreground">{s.text}</span></span>
              </li>
            ))}
          </ol>
          {hasGentle && (
            <div className="mt-5 rounded-2xl bg-white/70 p-3">
              <Switch checked={gentle} onChange={v => { setGentle(v); if (profile) updateProfile.mutate({ onboarding_preferences: { ...profile.onboarding_preferences, gentle_breathing: v } }) }}
                label="Use a gentler pace" description="Shorter holds (in 4 · hold 4 · out 6). Recommended if you are new to breath-holding." />
            </div>
          )}
          <Button size="lg" block className="mt-5" onClick={start}><Play className="size-5" aria-hidden /> Start</Button>
        </div>
      </div>
    )
  }

  if (phase === 'done' || phase === 'stopped') {
    return (
      <div className="max-w-md mx-auto">{back}
        <div className="glass rounded-3xl p-6 text-center animate-fade-up" role="status">
          <p className="text-5xl" aria-hidden>{phase === 'done' ? '🌸' : '🌿'}</p>
          <h1 className="text-2xl font-extrabold mt-2">{phase === 'done' ? 'Well done' : 'Stopping is okay'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phase === 'done' ? 'You completed this exercise.' : 'Listening to your body is the right call. Take a few normal breaths and rest.'}
          </p>
          {phase === 'stopped' && (
            <details className="mt-4 text-left">
              <summary className="text-sm font-semibold text-primary-strong cursor-pointer">Need to talk to someone?</summary>
              <div className="mt-3"><HelplineList compact /></div>
            </details>
          )}
          {historyId.current && (
            <div className="mt-5 text-left">
              {reflectionSaved ? <p className="text-sm font-semibold text-primary-strong flex items-center gap-1"><Check className="size-4" /> Reflection saved</p> : (
                <>
                  <TextAreaField label="How do you feel now?" optional rows={3} maxLength={2000} value={reflection} onChange={e => setReflection(e.target.value)}
                    placeholder="A word or two is plenty." />
                  {mayIndicateCrisis(reflection) && <p className="text-xs mt-2 text-danger font-semibold">If you're thinking about harming yourself, please reach out now — <Link to="/app/help" className="underline">see support options</Link>.</p>}
                  <Button variant="outline" size="sm" className="mt-2" onClick={saveReflection} loading={savingReflection} disabled={!reflection.trim()}>Save reflection</Button>
                </>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2 mt-5">
            <Button variant="soft" onClick={() => { historyId.current = null; setReflection(''); setReflectionSaved(false); setStepIdx(0); timer.reset(); setPhase('intro') }}>Do it again</Button>
            <Link to="/app/exercises" className="text-sm font-semibold text-primary-strong hover:underline">More exercises</Link>
          </div>
        </div>
      </div>
    )
  }

  const pattern = step.breathing ? (gentle && step.gentle ? step.gentle : step.breathing) : null
  return (
    <div className="max-w-xl mx-auto">{back}
      <div className="glass rounded-3xl p-5 sm:p-7">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <span>Step {stepIdx + 1} of {steps.length}</span><span className="tabular-nums">{formatClockSeconds(timer.remaining)} left in step</span>
        </div>
        <div className="mt-2"><ProgressBar value={overall} label="Exercise progress" /></div>
        <h1 className="text-2xl font-extrabold mt-5 text-center" aria-live="polite">{step.title}</h1>
        <p className="text-center mt-2 text-base leading-relaxed">{step.text}</p>
        {pattern && <div className="flex justify-center my-6"><BreathingCircle pattern={pattern} elapsed={timer.elapsed} active={timer.status === 'running' || timer.status === 'paused'} size={200} /></div>}
        {!pattern && <div className="my-6 mx-auto size-24 rounded-full grid place-items-center text-2xl font-black tabular-nums bg-white/70 text-primary-strong">{formatClockSeconds(timer.remaining)}</div>}
        <div className="flex items-center justify-center gap-3">
          {timer.status === 'running' ? <Button size="lg" onClick={() => timer.act('pause')} className="px-8"><Pause className="size-5" aria-hidden /> Pause</Button>
            : <Button size="lg" onClick={() => timer.act('resume')} className="px-8"><Play className="size-5" aria-hidden /> Resume</Button>}
          <Button variant="soft" onClick={skip} aria-label={stepIdx < steps.length - 1 ? 'Next step' : 'Finish exercise'}><SkipForward className="size-5" /></Button>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          <Button variant="ghost" size="sm" onClick={() => complete(false)}><Check className="size-4" aria-hidden /> Mark complete</Button>
          <Button variant="ghost" size="sm" className="!text-accent-strong" onClick={() => complete(true)}>Stop — this doesn't feel right</Button>
        </div>
      </div>
    </div>
  )
}
