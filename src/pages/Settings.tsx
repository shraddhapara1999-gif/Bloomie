import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Download, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, Chip, Dialog, FormError, PageHeader, SectionTitle, SelectField, Switch, TextField } from '../components/ui'
import { useUpdateProfile } from '../hooks/queries'
import { WELLNESS_GOALS } from '../lib/constants'
import { browserTimezone } from '../lib/dates'
import { fieldErrors, passwordSchema, profileSchema } from '../lib/validation'
import { deleteAccount, exportAllData } from '../services/account'
import { downloadFile } from '../lib/csv'
import { supabase } from '../lib/supabase'
import type { OnboardingPreferences } from '../lib/types'

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    return []
  }
}

export function SettingsPage() {
  const { profile, user, signOut } = useAuth()
  const update = useUpdateProfile()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [tz, setTz] = useState(profile?.timezone ?? browserTimezone())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const prefs: OnboardingPreferences = profile?.onboarding_preferences ?? {}
  const zones = useMemo(() => { const z = timezones(); return z.includes(tz) ? z : [tz, ...z] }, [tz])

  const savePrefs = (patch: OnboardingPreferences, msg = 'Preferences saved') =>
    update.mutate({ onboarding_preferences: { ...prefs, ...patch } }, { onSuccess: () => toast.success(msg), onError: e => toast.error(e.message) })

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Settings" subtitle={user?.email ?? undefined} />

      <section aria-labelledby="profile">
        <SectionTitle id="profile">Profile</SectionTitle>
        <Card>
          <form className="grid sm:grid-cols-2 gap-4" noValidate onSubmit={e => {
            e.preventDefault()
            const parsed = profileSchema.safeParse({ display_name: name, timezone: tz })
            if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
            setErrors({})
            update.mutate(parsed.data, { onSuccess: () => toast.success('Profile saved'), onError: er => toast.error(er.message) })
          }}>
            <TextField label="Name" value={name} maxLength={80} onChange={e => setName(e.target.value)} error={errors.display_name} />
            <SelectField label="Timezone" value={tz} onChange={e => setTz(e.target.value)} error={errors.timezone}>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </SelectField>
            <div className="sm:col-span-2 flex flex-wrap gap-2 justify-between items-center">
              {tz !== browserTimezone() ? <Button type="button" variant="ghost" size="sm" onClick={() => setTz(browserTimezone())}>Use this device's timezone ({browserTimezone()})</Button> : <span />}
              <Button type="submit" loading={update.isPending}>Save profile</Button>
            </div>
          </form>
        </Card>
      </section>

      <section aria-labelledby="prefs">
        <SectionTitle id="prefs">Wellness preferences</SectionTitle>
        <Card className="space-y-5">
          <fieldset>
            <legend className="text-sm font-semibold mb-2">Focus areas</legend>
            <div className="flex flex-wrap gap-2">
              {WELLNESS_GOALS.map(g => {
                const on = prefs.goals?.includes(g.id)
                return <Chip key={g.id} selected={on} onClick={() => {
                  const goals = on ? prefs.goals!.filter(x => x !== g.id) : [...(prefs.goals ?? []), g.id]
                  savePrefs({ goals, focus_areas: goals })
                }}>{g.emoji} {g.label}</Chip>
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold mb-2">Preferred meditation length</legend>
            <div className="flex flex-wrap gap-2">
              {[2, 5, 10, 15, 20].map(m => <Chip key={m} selected={prefs.meditation_minutes === m} onClick={() => savePrefs({ meditation_minutes: m })}>{m} min</Chip>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold mb-2">Journaling style</legend>
            <div className="flex flex-wrap gap-2">
              {([['prompts', 'With prompts'], ['free', 'Free writing'], ['gratitude', 'Gratitude'], ['mixed', 'A mix']] as const).map(([id, label]) =>
                <Chip key={id} selected={prefs.journaling_style === id} onClick={() => savePrefs({ journaling_style: id })}>{label}</Chip>)}
            </div>
          </fieldset>
          <Switch checked={!!prefs.track_body_signals} onChange={v => savePrefs({ track_body_signals: v })} label="Cycle & body signals in check-ins" description="Adds optional period flow and symptom tracking." />
          <Switch checked={!!prefs.gentle_breathing} onChange={v => savePrefs({ gentle_breathing: v })} label="Gentler breathing by default" description="Use shorter breath holds in breathing exercises." />
          <Switch checked={!!prefs.speak_guidance} onChange={v => savePrefs({ speak_guidance: v })} label="Read meditation guidance aloud" description="Uses your device's built-in speech." />
          <p className="text-xs text-muted-foreground">Reminder times and quiet hours are in <Link to="/app/reminders" className="underline font-semibold text-primary-strong">Reminders</Link>.</p>
        </Card>
      </section>

      <AiSection />
      <SecuritySection />
      <DataSection />

      <section>
        <Button variant="outline" onClick={() => signOut()}><LogOut className="size-4" aria-hidden /> Sign out</Button>
      </section>
    </div>
  )
}

function AiSection() {
  const { profile } = useAuth()
  const update = useUpdateProfile()
  const [open, setOpen] = useState(false)
  const on = !!profile?.ai_opt_in
  return (
    <section aria-labelledby="ai">
      <SectionTitle id="ai">Optional AI features</SectionTitle>
      <Card>
        <Switch checked={on} onChange={v => v ? setOpen(true) : update.mutate({ ai_opt_in: false, ai_opt_in_at: null }, { onSuccess: () => toast.success('AI features turned off') })}
          label="Personalised journal prompts (AI)" description="Off by default. Bloomie works fully without AI." />
        <Dialog open={open} onClose={() => setOpen(false)} title="Before you turn on AI prompts"
          footer={<><Button variant="soft" onClick={() => setOpen(false)}>Not now</Button>
            <Button loading={update.isPending} onClick={() => update.mutate({ ai_opt_in: true, ai_opt_in_at: new Date().toISOString() }, { onSuccess: () => { setOpen(false); toast.success('AI prompts enabled') } })}>I understand, turn on</Button></>}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>When you ask for an AI prompt, your chosen focus areas and the feelings from your latest check-in are sent to our AI provider through our server.</li>
            <li><strong>Your journal text is never sent.</strong></li>
            <li>The AI is not a therapist and does not diagnose or give medical advice. Responses may be imperfect.</li>
            <li>You can turn this off at any time.</li>
          </ul>
        </Dialog>
      </Card>
    </section>
  )
}

function SecuritySection() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  return (
    <section aria-labelledby="sec">
      <SectionTitle id="sec">Password</SectionTitle>
      <Card>
        <form className="flex flex-wrap items-end gap-3" noValidate onSubmit={async e => {
          e.preventDefault()
          const p = passwordSchema.safeParse(pw)
          if (!p.success) { setErr(p.error.issues[0].message); return }
          setErr(undefined); setBusy(true)
          const { error } = await supabase!.auth.updateUser({ password: pw })
          setBusy(false)
          if (error) { setErr(error.message); return }
          setPw(''); toast.success('Password updated')
        }}>
          <TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} error={err} className="flex-1 min-w-[220px]" />
          <Button type="submit" variant="outline" loading={busy}>Update password</Button>
        </form>
      </Card>
    </section>
  )
}

function DataSection() {
  const { user } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <section aria-labelledby="data">
      <SectionTitle id="data">Your data &amp; privacy</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm flex gap-2"><ShieldCheck className="size-5 text-primary-strong shrink-0" aria-hidden /> Your entries are private to your account and never sold. Read our <Link to="/privacy" className="underline font-semibold text-primary-strong">Privacy Policy</Link>.</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">Export all my data</p><p className="text-xs text-muted-foreground">Everything Bloomie stores about you, as a JSON file.</p></div>
          <Button variant="outline" loading={exporting} onClick={async () => {
            setExporting(true)
            try {
              const data = await exportAllData()
              downloadFile(`bloomie-data-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
              toast.success('Your data export has downloaded')
            } catch (e) { toast.error(e instanceof Error ? e.message : 'Export failed') }
            finally { setExporting(false) }
          }}><Download className="size-4" aria-hidden /> Export</Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div><p className="text-sm font-semibold text-danger">Delete my account</p><p className="text-xs text-muted-foreground">Permanently deletes your account and all entries. This cannot be undone.</p></div>
          <Button variant="danger" onClick={() => { setTyped(''); setError(null); setOpen(true) }}><Trash2 className="size-4" aria-hidden /> Delete account</Button>
        </div>
      </Card>
      <Dialog open={open} onClose={() => !deleting && setOpen(false)} title="Delete your account?"
        footer={<><Button variant="soft" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" disabled={typed !== 'DELETE'} loading={deleting} onClick={async () => {
            setDeleting(true); setError(null)
            try { await deleteAccount(); toast.success('Your account has been deleted. Take care. 💚') }
            catch (e) { setError(e instanceof Error ? e.message : 'Could not delete account') }
            finally { setDeleting(false) }
          }}>Permanently delete</Button></>}>
        <div className="space-y-3">
          <p>This will permanently delete <strong>{user?.email}</strong> and all your check-ins, journal entries, sessions and reminders. Consider exporting your data first.</p>
          <TextField label={<>Type <strong>DELETE</strong> to confirm</>} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
          <FormError message={error} />
        </div>
      </Dialog>
    </section>
  )
}
