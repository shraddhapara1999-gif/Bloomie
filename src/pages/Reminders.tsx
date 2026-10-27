import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import clsx from 'clsx'
import { Bell, BellOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, Chip, Dialog, EmptyState, ErrorState, FormError, LoadingBlock, PageHeader, SectionTitle, SelectField, Switch, TextField } from '../components/ui'
import { useDeleteReminder, useReminderDeliveries, useReminders, useSaveReminder, useToggleReminder, useUpdateProfile } from '../hooks/queries'
import { DAY_NAMES, REMINDER_TYPES } from '../lib/constants'
import { formatClock } from '../lib/dates'
import { fieldErrors, reminderSchema } from '../lib/validation'
import { nextOccurrence } from '../../supabase/functions/_shared/schedule'
import { disablePush, enablePush, getPushSubscription, pushConfigured } from '../lib/push'
import type { Reminder, ReminderChannel, ReminderType } from '../lib/types'

const CHANNELS: { id: ReminderChannel; label: string; help: string }[] = [
  { id: 'browser', label: 'In-app (while Bloomie is open)', help: 'Shows a browser notification when Bloomie is open in a tab.' },
  { id: 'push', label: 'Push notification', help: 'Delivered by the server even when Bloomie is closed. Needs permission on this device.' },
  { id: 'email', label: 'Email', help: 'Sent by the server to your account email.' },
]

function daysLabel(days: number[]) {
  if (days.length === 7) return 'Every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'Weekdays'
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends'
  return [...days].sort().map(d => DAY_NAMES[d]).join(', ')
}

export function RemindersPage() {
  const { data, isPending, error, refetch } = useReminders()
  const toggle = useToggleReminder()
  const del = useDeleteReminder()
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Reminder | null>(null)

  return (
    <div className="max-w-3xl">
      <PageHeader title="Reminders" subtitle="Gentle nudges, only when you want them."
        action={<Button onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden /> Add reminder</Button>} />

      {error ? <ErrorState error={error} onRetry={() => refetch()} /> : isPending ? <LoadingBlock rows={2} /> : data!.length === 0 ? (
        <Card><EmptyState title="No reminders yet" body="Add a reminder for a check-in, meditation or journaling time that suits you." action={<Button onClick={() => setEditing('new')}>Add a reminder</Button>} /></Card>
      ) : (
        <ul className="space-y-3">
          {data!.map(r => {
            const t = REMINDER_TYPES.find(x => x.id === r.reminder_type)
            const next = nextOccurrence(r, new Date())
            return (
              <Card as="li" key={r.id} className={clsx('flex items-center gap-3 flex-wrap', !r.enabled && 'opacity-70')}>
                <span className="text-2xl" aria-hidden>{t?.emoji}</span>
                <div className="flex-1 min-w-[160px]">
                  <p className="font-bold">{formatClock(r.scheduled_time)} · {r.label || t?.defaultLabel}</p>
                  <p className="text-xs text-muted-foreground">{t?.label} · {daysLabel(r.days_of_week)} · {CHANNELS.find(c => c.id === r.notification_channel)?.label} · {r.timezone}</p>
                  {r.enabled && next && <p className="text-xs text-primary-strong font-semibold mt-0.5">Next: {new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(next)}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" role="switch" aria-checked={r.enabled} aria-label={`${r.enabled ? 'Disable' : 'Enable'} reminder at ${formatClock(r.scheduled_time)}`}
                    onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}
                    className={clsx('relative w-12 h-7 rounded-full transition-colors', r.enabled ? 'bg-primary-strong' : 'bg-[#b9d3cc]')}>
                    <span className={clsx('absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform', r.enabled && 'translate-x-5')} />
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)} aria-label="Edit reminder"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(r)} aria-label="Delete reminder"><Trash2 className="size-4" /></Button>
                </div>
              </Card>
            )
          })}
        </ul>
      )}

      <NotificationPreferences />
      <DeliveryHistory />

      {editing && <ReminderForm reminder={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete reminder?"
        footer={<><Button variant="soft" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={() => deleting && del.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Delete</Button></>}>
        <p>You will no longer receive this reminder.</p>
      </Dialog>
    </div>
  )
}

function ReminderForm({ reminder, onClose }: { reminder: Reminder | null; onClose: () => void }) {
  const { timezone } = useAuth()
  const save = useSaveReminder()
  const [type, setType] = useState<ReminderType>(reminder?.reminder_type ?? 'mood_checkin')
  const [label, setLabel] = useState(reminder?.label ?? '')
  const [time, setTime] = useState(reminder?.scheduled_time.slice(0, 5) ?? '20:00')
  const [days, setDays] = useState<number[]>(reminder?.days_of_week ?? [0, 1, 2, 3, 4, 5, 6])
  const [channel, setChannel] = useState<ReminderChannel>(reminder?.notification_channel ?? 'browser')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = async () => {
    const parsed = reminderSchema.safeParse({
      reminder_type: type, label, scheduled_time: time, days_of_week: days,
      timezone: reminder?.timezone ?? timezone, enabled: reminder?.enabled ?? true, notification_channel: channel,
    })
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
    if (channel === 'browser' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => undefined)
    }
    try {
      await save.mutateAsync({ id: reminder?.id, input: { ...parsed.data, timezone: timezone } })
      toast.success(reminder ? 'Reminder updated' : 'Reminder added')
      onClose()
    } catch { /* error shown below */ }
  }

  return (
    <Dialog open onClose={onClose} title={reminder ? 'Edit reminder' : 'New reminder'}
      footer={<><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={save.isPending}>Save</Button></>}>
      <div className="space-y-4">
        <fieldset>
          <legend className="text-sm font-semibold mb-1.5">Remind me to…</legend>
          <div className="flex flex-wrap gap-2">
            {REMINDER_TYPES.map(t => <Chip key={t.id} selected={type === t.id} onClick={() => setType(t.id)}>{t.emoji} {t.label}</Chip>)}
          </div>
        </fieldset>
        <TextField label="Message" optional value={label} maxLength={80} onChange={e => setLabel(e.target.value)} placeholder={REMINDER_TYPES.find(t => t.id === type)?.defaultLabel} error={errors.label} />
        <TextField label="Time" type="time" value={time} onChange={e => setTime(e.target.value)} error={errors.scheduled_time} hint={`In your timezone (${timezone})`} />
        <fieldset>
          <legend className="text-sm font-semibold mb-1.5">Days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((d, i) => (
              <Chip key={d} className="!px-3" selected={days.includes(i)} onClick={() => setDays(ds => ds.includes(i) ? ds.filter(x => x !== i) : [...ds, i].sort())}>{d}</Chip>
            ))}
          </div>
          {errors.days_of_week && <p role="alert" className="text-xs text-danger mt-1">{errors.days_of_week}</p>}
        </fieldset>
        <SelectField label="Deliver by" value={channel} onChange={e => setChannel(e.target.value as ReminderChannel)}>
          {CHANNELS.map(c => <option key={c.id} value={c.id} disabled={c.id === 'push' && !pushConfigured()}>{c.label}{c.id === 'push' && !pushConfigured() ? ' — not configured' : ''}</option>)}
        </SelectField>
        <p className="text-xs text-muted-foreground -mt-2">{CHANNELS.find(c => c.id === channel)?.help}</p>
        <FormError message={save.error?.message} />
      </div>
    </Dialog>
  )
}

function NotificationPreferences() {
  const { profile } = useAuth()
  const update = useUpdateProfile()
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const [pushOn, setPushOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [qs, setQs] = useState(profile?.quiet_hours_start?.slice(0, 5) ?? '')
  const [qe, setQe] = useState(profile?.quiet_hours_end?.slice(0, 5) ?? '')

  useEffect(() => { if (pushConfigured()) getPushSubscription().then(s => setPushOn(!!s)).catch(() => undefined) }, [])

  return (
    <section className="mt-8" aria-labelledby="notif">
      <SectionTitle id="notif">Notification preferences</SectionTitle>
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">{permission === 'granted' ? <Bell className="size-4 text-primary-strong" /> : <BellOff className="size-4 text-muted-foreground" />} Browser notifications</p>
            <p className="text-xs text-muted-foreground">
              {permission === 'granted' ? 'Allowed on this device.' : permission === 'denied' ? 'Blocked. Allow notifications for this site in your browser settings.' : permission === 'unsupported' ? 'Not supported by this browser.' : 'Not yet allowed.'}
            </p>
          </div>
          {permission === 'default' && <Button size="sm" variant="outline" onClick={async () => setPermission(await Notification.requestPermission())}>Allow</Button>}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold">Push on this device</p>
            <p className="text-xs text-muted-foreground">{pushConfigured() ? 'Receive reminders even when Bloomie is closed.' : 'Not available — push (VAPID) keys have not been configured for this deployment.'}</p>
          </div>
          {pushConfigured() && (
            <Button size="sm" variant="outline" loading={busy} onClick={async () => {
              setBusy(true)
              try { if (pushOn) { await disablePush(); setPushOn(false) } else { await enablePush(); setPushOn(true); setPermission('granted') } toast.success(pushOn ? 'Push turned off' : 'Push enabled on this device') }
              catch (e) { toast.error(e instanceof Error ? e.message : 'Could not change push setting') }
              finally { setBusy(false) }
            }}>{pushOn ? 'Turn off' : 'Enable'}</Button>
          )}
        </div>

        <Switch checked={!!profile?.email_notifications} disabled={update.isPending}
          onChange={v => update.mutate({ email_notifications: v }, { onSuccess: () => toast.success(v ? 'Email reminders on' : 'Email reminders off') })}
          label="Email reminders" description="Allow reminders set to 'Email' to be sent to your account address. Every email has an unsubscribe link." />

        <div>
          <p className="text-sm font-semibold">Quiet hours</p>
          <p className="text-xs text-muted-foreground mb-2">No reminders are delivered during this time.</p>
          <div className="flex flex-wrap items-end gap-3">
            <TextField label="From" type="time" value={qs} onChange={e => setQs(e.target.value)} className="w-36" />
            <TextField label="Until" type="time" value={qe} onChange={e => setQe(e.target.value)} className="w-36" />
            <Button size="sm" variant="outline" loading={update.isPending} onClick={() => {
              if (!!qs !== !!qe) { toast.error('Please set both a start and an end time'); return }
              update.mutate({ quiet_hours_start: qs || null, quiet_hours_end: qe || null }, { onSuccess: () => toast.success(qs ? 'Quiet hours saved' : 'Quiet hours cleared') })
            }}>Save</Button>
            {(qs || qe) && <Button size="sm" variant="ghost" onClick={() => { setQs(''); setQe('') }}>Clear</Button>}
          </div>
        </div>
      </Card>
    </section>
  )
}

function DeliveryHistory() {
  const { data, isPending } = useReminderDeliveries()
  return (
    <section className="mt-8" aria-labelledby="hist">
      <SectionTitle id="hist">Delivery history</SectionTitle>
      <Card>
        <p className="text-xs text-muted-foreground mb-3">Email and push deliveries recorded by the server. In-app reminders are not logged here.</p>
        {isPending ? <LoadingBlock rows={1} /> : !data?.length ? <p className="text-sm text-muted-foreground">Nothing delivered yet.</p> : (
          <ul className="divide-y divide-border text-sm">
            {data.map(d => (
              <li key={d.id} className="py-2 flex justify-between gap-3">
                <span><span className={clsx('font-semibold', d.status === 'sent' ? 'text-primary-strong' : d.status === 'failed' ? 'text-danger' : 'text-muted-foreground')}>{d.status === 'sent' ? '✓ Sent' : d.status === 'failed' ? '✕ Failed' : '– Skipped'}</span> via {d.channel}{d.detail ? ` · ${d.detail}` : ''}</span>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(d.scheduled_for).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
