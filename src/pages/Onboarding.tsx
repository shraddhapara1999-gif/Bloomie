import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '../auth/AuthProvider'
import { BloomieMascot, FloralBg, Wordmark } from '../components/brand'
import { Button, Chip, FormError, Switch } from '../components/ui'
import { WELLNESS_GOALS } from '../lib/constants'
import type { OnboardingPreferences } from '../lib/types'
import { useUpdateProfile } from '../hooks/queries'
import { createReminder } from '../services/reminders'
import { browserTimezone, formatClock } from '../lib/dates'

const STEPS = ['Goals', 'Practice', 'Reminders'] as const
const REMINDER_PRESETS = [
  { id: 'morning', time: '08:00', label: 'Morning', type: 'meditation' as const },
  { id: 'midday', time: '13:00', label: 'Midday', type: 'mood_checkin' as const },
  { id: 'evening', time: '20:30', label: 'Evening', type: 'journal' as const },
]

export function OnboardingPage() {
  const { profile, user } = useAuth()
  const nav = useNavigate()
  const update = useUpdateProfile()
  const [step, setStep] = useState(0)
  const [prefs, setPrefs] = useState<OnboardingPreferences>({
    goals: [], meditation_minutes: 5, journaling_style: 'prompts', track_body_signals: false, reminder_times: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (profile?.onboarding_completed_at) return <Navigate to="/app" replace />

  const toggle = (key: 'goals' | 'reminder_times', v: string) =>
    setPrefs(p => ({ ...p, [key]: p[key]?.includes(v) ? p[key]!.filter(x => x !== v) : [...(p[key] ?? []), v] }))

  const finish = async () => {
    if (saving) return
    setSaving(true); setError(null)
    try {
      const tz = browserTimezone()
      await update.mutateAsync({
        onboarding_preferences: { ...prefs, focus_areas: prefs.goals },
        onboarding_completed_at: new Date().toISOString(),
        timezone: profile?.timezone && profile.timezone !== 'UTC' ? profile.timezone : tz,
      })
      const chosen = REMINDER_PRESETS.filter(p => prefs.reminder_times?.includes(p.id))
      if (chosen.length) {
        await Promise.all(chosen.map(p => createReminder({
          reminder_type: p.type, label: '', scheduled_time: p.time, days_of_week: [0, 1, 2, 3, 4, 5, 6],
          timezone: tz, enabled: true, notification_channel: 'browser',
        })))
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          await Notification.requestPermission().catch(() => undefined)
        }
      }
      toast.success('You are all set 🌱')
      nav('/app', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your preferences')
    } finally {
      setSaving(false)
    }
  }

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : finish())

  return (
    <div className="min-h-dvh relative flex flex-col items-center px-4 py-8">
      <FloralBg />
      <main className="relative z-10 w-full max-w-md">
        <div className="flex flex-col items-center mb-4"><BloomieMascot size={48} /><Wordmark /></div>
        <ol className="flex items-center justify-center mb-5" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center" aria-current={i === step ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                <div className={`size-7 rounded-full grid place-items-center text-xs font-bold transition ${i <= step ? 'bg-primary-strong text-white' : 'bg-border text-muted-foreground'}`}>{i < step ? '✓' : i + 1}</div>
                <span className="text-[11px] mt-1 text-muted-foreground">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`w-12 h-0.5 mx-1 mb-4 ${i < step ? 'bg-primary-strong' : 'bg-border'}`} />}
            </li>
          ))}
        </ol>

        <div className="glass rounded-3xl p-5 sm:p-6 animate-fade-up" key={step}>
          {step === 0 && (
            <fieldset>
              <legend className="text-2xl font-extrabold text-center w-full">Hi {profile?.display_name || user?.email?.split('@')[0]} 👋</legend>
              <p className="text-sm text-muted-foreground text-center mt-1 mb-4">What would you like to focus on? Choose any — you can change this later.</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {WELLNESS_GOALS.map(g => (
                  <Chip key={g.id} selected={prefs.goals?.includes(g.id)} onClick={() => toggle('goals', g.id)}>{g.emoji} {g.label}</Chip>
                ))}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <fieldset>
                <legend className="text-xl font-extrabold">How long would you like to meditate?</legend>
                <p className="text-sm text-muted-foreground mb-3">We'll suggest sessions around this length.</p>
                <div className="flex flex-wrap gap-2">
                  {[2, 5, 10, 15, 20].map(m => <Chip key={m} selected={prefs.meditation_minutes === m} onClick={() => setPrefs(p => ({ ...p, meditation_minutes: m }))}>{m} min</Chip>)}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-xl font-extrabold">How do you like to journal?</legend>
                <div className="flex flex-wrap gap-2 mt-3">
                  {([['prompts', 'With prompts'], ['free', 'Free writing'], ['gratitude', 'Gratitude'], ['mixed', 'A mix']] as const).map(([id, label]) => (
                    <Chip key={id} selected={prefs.journaling_style === id} onClick={() => setPrefs(p => ({ ...p, journaling_style: id }))}>{label}</Chip>
                  ))}
                </div>
              </fieldset>
              <Switch checked={!!prefs.track_body_signals} onChange={v => setPrefs(p => ({ ...p, track_body_signals: v }))}
                label="Include cycle & body signals in check-ins"
                description="Optional. Adds period flow and symptom tracking. Stored privately in your account." />
            </div>
          )}

          {step === 2 && (
            <fieldset>
              <legend className="text-xl font-extrabold">Would gentle reminders help?</legend>
              <p className="text-sm text-muted-foreground mb-3">Pick any times. We keep notifications few and calm, and you can edit or turn them off anytime.</p>
              <div className="flex flex-col gap-2">
                {REMINDER_PRESETS.map(p => (
                  <Chip key={p.id} className="!rounded-2xl text-left !py-3" selected={prefs.reminder_times?.includes(p.id)} onClick={() => toggle('reminder_times', p.id)}>
                    {p.label} · {formatClock(p.time)} — {p.type === 'meditation' ? 'meditation' : p.type === 'journal' ? 'journaling' : 'mood check-in'}
                  </Chip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">Reminders appear as browser notifications while Bloomie is open. Email or push delivery can be enabled in Reminders.</p>
            </fieldset>
          )}

          <div className="mt-6 space-y-2">
            <FormError message={error} />
            <Button block size="lg" onClick={next} loading={saving}>{step < STEPS.length - 1 ? 'Continue' : 'Start using Bloomie'}</Button>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)} disabled={step === 0}>← Back</Button>
              <Button variant="ghost" size="sm" onClick={next} disabled={saving}>Skip</Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
