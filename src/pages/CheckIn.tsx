import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import clsx from 'clsx'
import { useAuth } from '../auth/AuthProvider'
import { BloomieMascot } from '../components/brand'
import { Button, ButtonLink, Chip, FormError } from '../components/ui'
import { SafetyDialog } from '../components/Safety'
import { MoodWeekChart } from '../components/charts'
import { EMOTIONS, FLOW_COLORS, FOG_LABELS, MAX_NOTE, MOOD_LEVELS, MOVEMENT_OPTIONS, PERIOD_FLOWS, SLEEP_LABELS, STRESS_LABELS, SYMPTOMS, emotion, moodLevel } from '../lib/constants'
import { useCreateMood, useToday } from '../hooks/queries'
import { mayIndicateCrisis } from '../lib/crisis'
import type { MoodEntry } from '../lib/types'

interface Draft {
  mood: number | null
  emotions: string[]
  energy: number
  focus: number
  stress: number
  sleep: number
  periodFlow: string
  symptoms: string[]
  meds: boolean
  movement: string
  water: boolean
  note: string
}

const initial: Draft = {
  mood: null, emotions: [], energy: 3, focus: 2, stress: 2, sleep: 3,
  periodFlow: 'None', symptoms: [], meds: false, movement: '', water: false, note: '',
}

const MESSAGES: Record<string, string> = {
  calm: "You're carrying a gentle peace with you today. That's a gift. 🌸",
  anxious: 'Anxiety can feel heavy — your body is working hard. Be tender with yourself today. 💙',
  down: "Low days are part of the rhythm, not a flaw. You showed up anyway. That's brave. 🌧️",
  jittery: 'That restless energy makes sense. Maybe your nervous system would like some softness. 💨',
  peaceful: 'What a lovely feeling to carry into today. You deserve this peace. ✨',
  tired: 'Tiredness is real. Give yourself some grace today — rest counts. 🌙',
  hopeful: 'Hope is a quiet superpower. Carry it gently. 🌱',
  grateful: 'Noticing what you appreciate is a lovely habit. 🙏',
  lonely: 'Feeling lonely is hard. Reaching out to someone, even briefly, can help. 🫶',
  frustrated: 'Frustration often points to something that matters to you. It is okay to pause. 🌿',
}

function bloomieMessage(d: Pick<Draft, 'mood' | 'emotions'>): string {
  const first = d.emotions.find(e => MESSAGES[e])
  if (first) return MESSAGES[first]
  if (d.mood && d.mood <= 2) return 'Thank you for checking in on a hard day. Small steps count. 💙'
  return 'You showed up for yourself today. That truly matters. 💚'
}

export function CheckInPage() {
  const { profile } = useAuth()
  const trackBody = !!profile?.onboarding_preferences?.track_body_signals
  const [step, setStep] = useState(1)
  const [d, setD] = useState<Draft>(initial)
  const [saved, setSaved] = useState<MoodEntry | null>(null)
  const [showSafety, setShowSafety] = useState(false)
  const create = useCreateMood()
  const today = useToday()
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    if (!d.mood || create.isPending) return
    try {
      const entry = await create.mutateAsync({
        mood_score: d.mood,
        emotion_tags: d.emotions,
        energy_level: d.energy,
        focus_level: d.focus,
        stress_level: d.stress,
        sleep_quality: d.sleep,
        body_signals: trackBody ? { period_flow: d.periodFlow, symptoms: d.symptoms } : null,
        habits: { meds_taken: d.meds, movement: d.movement || undefined, water_met: d.water },
        optional_note: d.note.trim() || null,
        entry_date: today,
      })
      setSaved(entry)
      setStep(4)
      if (mayIndicateCrisis(d.note)) setShowSafety(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your check-in')
    }
  }

  return (
    <div className="max-w-md mx-auto">
      {step < 4 && <StepBar step={step} />}
      <div className={clsx('rounded-3xl p-5 transition-all', step < 4 && 'glass')}>
        {step === 1 && <MindStep d={d} set={set} onNext={() => setStep(2)} />}
        {step === 2 && <BodyStep d={d} set={set} trackBody={trackBody} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <HabitsStep d={d} set={set} onSubmit={submit} onBack={() => setStep(2)} saving={create.isPending} error={create.error?.message} />}
        {step === 4 && saved && <Summary entry={saved} draft={d} trackBody={trackBody} onReset={() => { setD(initial); setSaved(null); setStep(1) }} />}
      </div>
      <SafetyDialog open={showSafety} onClose={() => setShowSafety(false)} />
    </div>
  )
}

function StepBar({ step }: { step: number }) {
  return (
    <ol className="flex items-center justify-center mb-5" aria-label={`Step ${step} of 3`}>
      {['Mind', 'Body', 'Habits'].map((label, i) => {
        const s = i + 1
        return (
          <li key={s} className="flex items-center" aria-current={step === s ? 'step' : undefined}>
            <div className="flex flex-col items-center">
              <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300', step >= s ? 'bg-primary-strong text-white' : 'bg-border text-muted-foreground')}>
                {step > s ? '✓' : s}
              </div>
              <span className="text-[11px] mt-1 text-muted-foreground">{label}</span>
            </div>
            {i < 2 && <div className={clsx('w-14 h-0.5 mx-1 mb-4 transition-all duration-500', step > s ? 'bg-primary-strong' : 'bg-border')} />}
          </li>
        )
      })}
    </ol>
  )
}

type StepProps = { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void }

function Scale({ label, value, onChange, valueLabel }: { label: string; value: number; onChange: (n: number) => void; valueLabel: string }) {
  return (
    <fieldset className="rounded-2xl p-4 bg-muted">
      <div className="flex items-center justify-between mb-3">
        <legend className="font-bold text-base font-display">{label}</legend>
        <span className="text-sm font-semibold text-primary-strong" aria-hidden>{valueLabel}</span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n} aria-label={`${label} ${n} of 5`}
            className={clsx('flex-1 h-10 rounded-xl text-sm font-semibold transition-all', value >= n ? 'bg-primary-strong text-white' : 'bg-border text-muted-foreground')}>
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function MindStep({ d, set, onNext }: StepProps & { onNext: () => void }) {
  const [page, setPage] = useState(0)
  const perPage = 5
  const pages = Math.ceil(EMOTIONS.length / perPage)
  const visible = EMOTIONS.slice(page * perPage, page * perPage + perPage)
  const toggleEmotion = (id: string) => set('emotions', d.emotions.includes(id) ? d.emotions.filter(e => e !== id) : [...d.emotions, id])

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">Mind &amp; Spirit</h1>
        <p className="text-muted-foreground text-sm mt-1">How are you feeling right now?</p>
      </div>

      <fieldset className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
        <legend className="sr-only">Overall mood</legend>
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Overall mood">
          {MOOD_LEVELS.map(m => (
            <button key={m.score} type="button" role="radio" aria-checked={d.mood === m.score} aria-label={m.label} onClick={() => set('mood', m.score)}
              className="flex flex-col items-center gap-1.5 py-1 rounded-xl">
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-all duration-200"
                style={{
                  background: d.mood === m.score ? m.color : '#f0f7f5',
                  transform: d.mood === m.score ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: d.mood === m.score ? `0 4px 14px ${m.color}aa` : 'none',
                  border: `2px solid ${d.mood === m.score ? m.color : 'transparent'}`,
                }} aria-hidden>{m.emoji}</span>
              <span className={clsx('text-xs font-semibold', d.mood === m.score ? 'text-foreground' : 'text-muted-foreground')}>{m.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-2xl p-4 bg-muted">
        <legend className="sr-only">Feelings (optional)</legend>
        <div className="flex justify-between items-center mb-3">
          <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="text-sm px-2 py-1 rounded-lg text-primary-strong disabled:opacity-30">‹ Prev</button>
          <span className="text-xs font-semibold text-muted-foreground">Feelings · optional</span>
          <button type="button" onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
            className="text-sm px-2 py-1 rounded-lg text-primary-strong disabled:opacity-30">Next ›</button>
        </div>
        <div className="flex justify-around">
          {visible.map(m => {
            const on = d.emotions.includes(m.id)
            return (
              <button key={m.id} type="button" onClick={() => toggleEmotion(m.id)} aria-pressed={on} aria-label={m.label} className="flex flex-col items-center gap-1.5">
                <span className="w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-all duration-200" aria-hidden
                  style={{ background: on ? m.bg : '#f0f7f5', transform: on ? 'scale(1.15)' : 'scale(1)', boxShadow: on ? `0 4px 14px ${m.bg}aa` : 'none', border: `2px solid ${on ? m.bg : 'transparent'}` }}>
                  {m.emoji}
                </span>
                <span className={clsx('text-[11px] font-semibold', on ? 'text-foreground' : 'text-muted-foreground')}>{m.label}</span>
              </button>
            )
          })}
        </div>
        <div className="flex justify-center gap-1.5 mt-3" aria-hidden>
          {Array.from({ length: pages }).map((_, i) => (
            <div key={i} className="rounded-full transition-all h-1.5" style={{ width: i === page ? 16 : 6, background: i === page ? 'var(--primary)' : 'var(--border)' }} />
          ))}
        </div>
      </fieldset>

      <Scale label="Energy Level" value={d.energy} onChange={n => set('energy', n)} valueLabel={`${d.energy}/5`} />

      <fieldset className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
        <legend className="sr-only">Focus and fog</legend>
        <h2 className="font-bold text-center text-base mb-3" aria-hidden>Focus &amp; Fog</h2>
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1.5" role="radiogroup" aria-label="Focus and fog">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={d.focus === n} aria-label={FOG_LABELS[n].label} onClick={() => set('focus', n)}
                className={clsx('flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition-all text-left border-[1.5px]',
                  d.focus === n ? 'bg-secondary text-foreground border-primary-strong' : 'border-transparent text-muted-foreground hover:bg-muted')}>
                <span>{n}:</span><span>{FOG_LABELS[n].label}</span><span className="ml-auto" aria-hidden>{FOG_LABELS[n].icon}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col items-center gap-1 w-8" aria-hidden>
            <div className="flex-1 w-4 rounded-full overflow-hidden relative bg-border min-h-[100px]">
              <div className="absolute bottom-0 inset-x-0 rounded-full transition-all duration-500" style={{ background: 'linear-gradient(to top, #5b9fac, #a8cfc7)', height: `${(d.focus / 5) * 100}%` }} />
            </div>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-primary">🌡️</div>
          </div>
        </div>
      </fieldset>

      <div className="rounded-2xl p-4 bg-muted">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="stress" className="font-bold text-base font-display">Stress Level</label>
          <span className="text-sm font-semibold text-accent-strong">{STRESS_LABELS[d.stress]}</span>
        </div>
        <input id="stress" type="range" min={1} max={5} value={d.stress} onChange={e => set('stress', Number(e.target.value))}
          aria-valuetext={STRESS_LABELS[d.stress].replace(/^\S+\s/, '')} />
      </div>

      <Button block size="lg" onClick={onNext} disabled={!d.mood}>{d.mood ? 'Next: Body Signals →' : 'Choose a mood to continue'}</Button>
    </div>
  )
}

function BodyStep({ d, set, trackBody, onNext, onBack }: StepProps & { trackBody: boolean; onNext: () => void; onBack: () => void }) {
  const toggleSymptom = (s: string) => set('symptoms', d.symptoms.includes(s) ? d.symptoms.filter(x => x !== s) : [...d.symptoms, s])
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">Body Signals</h1>
        <p className="text-muted-foreground text-sm mt-1">Tune into your physical self</p>
      </div>

      <fieldset className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
        <legend className="sr-only">Sleep quality</legend>
        <h2 className="font-bold text-sm mb-3 font-display" aria-hidden>💤 Sleep Quality</h2>
        <div className="flex gap-2 justify-center" role="radiogroup" aria-label="Sleep quality">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" role="radio" aria-checked={d.sleep === n} aria-label={`${n} of 5 — ${SLEEP_LABELS[n]}`} onClick={() => set('sleep', n)}
              className="text-3xl transition-all duration-200 p-1"
              style={{ transform: n <= d.sleep ? 'scale(1.15)' : 'scale(0.9)', filter: n <= d.sleep ? 'none' : 'grayscale(0.7) opacity(0.4)' }}>⭐</button>
          ))}
        </div>
        <p className="text-center text-xs mt-2 text-muted-foreground" aria-live="polite">{SLEEP_LABELS[d.sleep]}</p>
      </fieldset>

      {trackBody ? (
        <>
          <fieldset className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
            <legend className="sr-only">Cycle tracking</legend>
            <h2 className="font-bold text-sm mb-1 font-display" aria-hidden>🌙 Cycle Tracking</h2>
            <p className="text-xs mb-3 text-muted-foreground">Period flow</p>
            <div className="flex flex-wrap gap-2">
              {PERIOD_FLOWS.map(f => (
                <button key={f} type="button" onClick={() => set('periodFlow', f)} aria-pressed={d.periodFlow === f}
                  className="px-3.5 py-2 rounded-full text-sm font-semibold transition-all min-h-10"
                  style={{
                    background: d.periodFlow === f ? FLOW_COLORS[f] : 'var(--muted)',
                    color: d.periodFlow === f && f !== 'None' ? '#6a1a1a' : 'var(--foreground)',
                    border: `1.5px solid ${d.periodFlow === f ? FLOW_COLORS[f] : 'transparent'}`,
                    transform: d.periodFlow === f ? 'scale(1.06)' : 'scale(1)',
                  }}>{f}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
            <legend className="sr-only">Body symptoms</legend>
            <h2 className="font-bold text-sm mb-3 font-display" aria-hidden>🌸 Body Signals</h2>
            <div className="flex flex-wrap gap-2">
              {SYMPTOMS.map(s => <Chip key={s} selected={d.symptoms.includes(s)} onClick={() => toggleSymptom(s)}>{s}</Chip>)}
            </div>
            {d.symptoms.length > 0 && <p className="text-xs mt-3 italic text-muted-foreground">These signals are real and valid. Noticing them is a kind thing to do. 💙</p>}
          </fieldset>
        </>
      ) : (
        <p className="text-xs text-center text-muted-foreground">Want to track your cycle and body signals too? Turn it on in <Link to="/app/settings" className="underline font-semibold">Settings</Link>.</p>
      )}

      <div className="flex gap-3">
        <Button variant="soft" onClick={onBack} className="flex-1">← Back</Button>
        <Button onClick={onNext} className="flex-[2]">Next: Today's Habits →</Button>
      </div>
    </div>
  )
}

function CheckRow({ label, emoji, checked, onChange }: { label: string; emoji: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-3 w-full text-left min-h-10">
      <span className={clsx('w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-all border-2', checked ? 'bg-primary-strong border-primary-strong' : 'border-[#9cbdb5]')}>
        {checked && <span className="text-white text-xs font-bold" aria-hidden>✓</span>}
      </span>
      <span className="text-base" aria-hidden>{emoji}</span>
      <span className="text-sm font-semibold">{label}</span>
    </button>
  )
}

function HabitsStep({ d, set, onSubmit, onBack, saving, error }: StepProps & { onSubmit: () => void; onBack: () => void; saving: boolean; error?: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">A Little Help</h1>
        <p className="text-muted-foreground text-sm mt-1">Today's practices — all optional</p>
      </div>

      <div className="rounded-2xl p-4 flex flex-col gap-4 bg-card shadow-[var(--shadow-card)]">
        <CheckRow label="Supplements / meds taken" emoji="💊" checked={d.meds} onChange={v => set('meds', v)} />
        <div>
          <label htmlFor="movement" className="flex items-center gap-3 text-sm font-semibold"><span aria-hidden>🌿</span> Nourishing movement</label>
          <select id="movement" value={d.movement} onChange={e => set('movement', e.target.value)}
            className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm bg-muted border-[1.5px] border-border outline-none focus:border-primary-strong">
            <option value="">Choose movement type…</option>
            {MOVEMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <CheckRow label="Hydration target met" emoji="💧" checked={d.water} onChange={v => set('water', v)} />
      </div>

      <div className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
        <label htmlFor="note" className="block font-bold text-sm mb-2 font-display">💭 A gentle note <span className="text-muted-foreground font-normal">(optional)</span></label>
        <textarea id="note" value={d.note} onChange={e => set('note', e.target.value.slice(0, MAX_NOTE))} rows={3}
          placeholder="What does your mind or body need today?"
          className="w-full rounded-xl px-3 py-2.5 text-sm resize-none outline-none bg-muted border-[1.5px] border-border focus:border-primary-strong" />
        <p className="text-[11px] text-muted-foreground text-right">{d.note.length}/{MAX_NOTE} · private to you</p>
      </div>

      <FormError message={error} />
      <div className="flex gap-3">
        <Button variant="soft" onClick={onBack} className="flex-1" disabled={saving}>← Back</Button>
        <Button onClick={onSubmit} loading={saving} className="flex-[2]">Complete Check-in ✨</Button>
      </div>
    </div>
  )
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-2.5 bg-muted">
      <p className="font-semibold mb-0.5 text-[11px] text-muted-foreground">{label}</p>
      <p className="font-bold text-xs">{value}</p>
    </div>
  )
}

function Summary({ entry, draft, trackBody, onReset }: { entry: MoodEntry; draft: Draft; trackBody: boolean; onReset: () => void }) {
  const nav = useNavigate()
  const level = moodLevel(entry.mood_score)
  return (
    <div className="flex flex-col gap-5 animate-fade-up" role="status" aria-live="polite">
      <div className="rounded-2xl p-5 flex flex-col items-center text-center gap-3 bg-card shadow-[0_4px_20px_rgba(91,159,172,0.15)]">
        <BloomieMascot size={80} />
        <h1 className="text-xl font-extrabold text-primary-strong">Check-in saved</h1>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-[280px]">{bloomieMessage(draft)}</p>
      </div>

      <section className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
        <h2 className="font-bold text-base mb-3">📋 Today's Check-In</h2>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <SummaryChip label="Mood" value={`${level.emoji} ${level.label}`} />
          <SummaryChip label="Energy" value={`${draft.energy}/5`} />
          <SummaryChip label="Focus" value={`${FOG_LABELS[draft.focus].icon} ${FOG_LABELS[draft.focus].label}`} />
          <SummaryChip label="Stress" value={`${draft.stress}/5`} />
          <SummaryChip label="Sleep" value={'⭐'.repeat(draft.sleep)} />
          {trackBody && <SummaryChip label="Period" value={draft.periodFlow} />}
          <SummaryChip label="Meds" value={draft.meds ? '✅ Taken' : '—'} />
          <SummaryChip label="Water" value={draft.water ? '💧 Met' : '—'} />
        </div>
        {draft.emotions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {draft.emotions.map(e => <span key={e} className="px-2.5 py-1 rounded-full text-xs font-medium bg-secondary">{emotion(e)?.emoji} {emotion(e)?.label}</span>)}
          </div>
        )}
        {entry.optional_note && <div className="mt-3 rounded-xl p-3 italic text-xs bg-muted text-muted-foreground">“{entry.optional_note}”</div>}
      </section>

      <section className="rounded-2xl p-4 bg-card shadow-[var(--shadow-card)]">
        <h2 className="font-bold text-base mb-1">📈 My Week: Mood &amp; Energy</h2>
        <p className="text-xs mb-3 text-muted-foreground">Based on your check-ins over the last 7 days</p>
        <MoodWeekChart />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => nav(`/app/journal/new?mood=${entry.id}&type=mood`)}>📔 Write about it</Button>
        <ButtonLink to="/app/meditate" variant="outline">🧘 Take a breath</ButtonLink>
      </div>

      <p className="rounded-xl p-3 text-xs text-center bg-muted text-muted-foreground">
        Bloomie supports your wellness journey but is not a medical tool. You can share your logs with a healthcare provider if helpful. 💙
      </p>
      <div className="flex gap-3">
        <Button variant="soft" className="flex-1" onClick={onReset}>↩ New check-in</Button>
        <ButtonLink to="/app" className="flex-1">Back home</ButtonLink>
      </div>
    </div>
  )
}
