// Server-side reminder scheduler. Invoke every 5 minutes (pg_cron + pg_net, see
// docs/SUPABASE.md). For each enabled email/push reminder due in the last window,
// it records exactly one row in reminder_deliveries (unique per reminder+slot)
// and attempts delivery. Unconfigured providers are logged as "skipped", never "sent".
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { dueOccurrence, inQuietHours, localParts } from '../_shared/schedule.ts'
import { json, log, requireEnv } from '../_shared/http.ts'

const WINDOW_MINUTES = Number(Deno.env.get('REMINDER_WINDOW_MINUTES') ?? '5')

const COPY: Record<string, { title: string; body: string; path: string }> = {
  mood_checkin: { title: 'How are you feeling?', body: 'A few seconds to check in with yourself.', path: '/app/check-in' },
  meditation: { title: 'Time for a mindful pause', body: 'A short breathing break is waiting for you.', path: '/app/meditate' },
  journal: { title: 'A few words for your journal', body: 'What is on your mind today?', path: '/app/journal/new' },
  custom: { title: 'Gentle reminder', body: 'A little nudge from Bloomie.', path: '/app' },
}

Deno.serve(async req => {
  // Only the scheduler may call this function.
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json(req, { error: 'Unauthorized' }, 401)

  const url = requireEnv('SUPABASE_URL')
  const admin = createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
  const appUrl = Deno.env.get('APP_URL') ?? ''
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const emailFrom = Deno.env.get('EMAIL_FROM')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@example.com'
  const pushReady = !!(vapidPublic && vapidPrivate)
  if (pushReady) webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!)

  const now = new Date()
  const { data: reminders, error } = await admin.from('reminders')
    .select('id, user_id, reminder_type, label, scheduled_time, days_of_week, timezone, enabled, notification_channel')
    .eq('enabled', true).in('notification_channel', ['email', 'push'])
  if (error) { log('reminders_query_failed'); return json(req, { error: 'query failed' }, 500) }

  const stats = { due: 0, sent: 0, skipped: 0, failed: 0, duplicate: 0 }
  for (const r of reminders ?? []) {
    const slot = dueOccurrence(r, now, WINDOW_MINUTES)
    if (!slot) continue
    stats.due++

    // Claim the slot first; the unique constraint prevents double delivery across overlapping runs.
    const { data: claim, error: claimErr } = await admin.from('reminder_deliveries')
      .insert({ reminder_id: r.id, user_id: r.user_id, channel: r.notification_channel, status: 'skipped', detail: 'pending', scheduled_for: slot.toISOString() })
      .select('id').single()
    if (claimErr) { stats.duplicate++; continue }

    const finish = async (status: 'sent' | 'skipped' | 'failed', detail: string) => {
      stats[status]++
      await admin.from('reminder_deliveries').update({ status, detail }).eq('id', claim.id)
      if (status === 'sent') await admin.from('reminders').update({ last_sent_at: now.toISOString() }).eq('id', r.id)
    }

    const { data: profile } = await admin.from('profiles').select('email_notifications, quiet_hours_start, quiet_hours_end, unsubscribe_token').eq('id', r.user_id).single()
    if (!profile) { await finish('skipped', 'profile missing'); continue }
    const { minutes } = localParts(now, r.timezone)
    if (inQuietHours(minutes, profile.quiet_hours_start, profile.quiet_hours_end)) { await finish('skipped', 'quiet hours'); continue }

    const copy = COPY[r.reminder_type] ?? COPY.custom
    const title = r.label || copy.title

    if (r.notification_channel === 'email') {
      if (!profile.email_notifications) { await finish('skipped', 'email notifications off'); continue }
      if (!resendKey || !emailFrom) { await finish('skipped', 'email provider not configured'); continue }
      const { data: u } = await admin.auth.admin.getUserById(r.user_id)
      const to = u?.user?.email
      if (!to) { await finish('skipped', 'no email address'); continue }
      const unsubscribe = `${url}/functions/v1/unsubscribe?token=${profile.unsubscribe_token}`
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: emailFrom, to, subject: title,
          headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;color:#1e3a35">
            <h2 style="color:#3b7a87">${escapeHtml(title)}</h2><p>${copy.body}</p>
            ${appUrl ? `<p><a href="${appUrl}${copy.path}" style="background:#3b7a87;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none">Open Bloomie</a></p>` : ''}
            <p style="font-size:12px;color:#4d716b">You set up this reminder in Bloomie. <a href="${unsubscribe}">Unsubscribe from reminder emails</a>.</p></div>`,
        }),
      })
      await finish(res.ok ? 'sent' : 'failed', res.ok ? 'email accepted by provider' : `email provider error ${res.status}`)
      continue
    }

    // Push
    if (!pushReady) { await finish('skipped', 'push not configured'); continue }
    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', r.user_id)
    if (!subs?.length) { await finish('skipped', 'no push subscription'); continue }
    let ok = 0
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body: copy.body, url: copy.path, tag: `${r.id}@${slot.toISOString()}` }), { TTL: 3600 })
        ok++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
    await finish(ok ? 'sent' : 'failed', ok ? `push accepted for ${ok} device(s)` : 'push delivery failed')
  }

  log('send_reminders_run', stats)
  return json(req, stats)
})

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
