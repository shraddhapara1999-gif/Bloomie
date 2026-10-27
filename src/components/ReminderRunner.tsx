import { useEffect } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useReminders } from '../hooks/queries'
import { dueOccurrence, inQuietHours, localParts } from '../../supabase/functions/_shared/schedule'
import { REMINDER_TYPES } from '../lib/constants'

const FIRED_KEY = 'bloomie:fired-reminders'

function readFired(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') } catch { return {} }
}
function writeFired(v: Record<string, number>) {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(v)) } catch { /* storage unavailable */ }
}

const PATHS: Record<string, string> = {
  mood_checkin: '/app/check-in', meditation: '/app/meditate', journal: '/app/journal/new', custom: '/app',
}

/**
 * In-app reminders for the "browser" channel. These fire only while Bloomie is
 * open in a tab; closed-app delivery uses web push or email from the server.
 */
export function ReminderRunner() {
  const { profile } = useAuth()
  const { data: reminders } = useReminders()

  useEffect(() => {
    if (!reminders?.length || typeof Notification === 'undefined') return
    const run = async () => {
      if (Notification.permission !== 'granted') return
      const now = new Date()
      const fired = readFired()
      for (const r of reminders) {
        if (r.notification_channel !== 'browser') continue
        const at = dueOccurrence(r, now, 2)
        if (!at) continue
        const key = `${r.id}@${at.toISOString()}`
        if (fired[key]) continue
        const { minutes } = localParts(now, r.timezone)
        fired[key] = Date.now()
        if (inQuietHours(minutes, profile?.quiet_hours_start ?? null, profile?.quiet_hours_end ?? null)) continue
        const type = REMINDER_TYPES.find(t => t.id === r.reminder_type)
        const title = r.label || type?.defaultLabel || 'Bloomie'
        const options: NotificationOptions = { body: 'A gentle nudge from Bloomie 🌱', icon: '/favicon.svg', tag: key, data: { url: PATHS[r.reminder_type] } }
        try {
          const reg = await navigator.serviceWorker?.getRegistration()
          if (reg) await reg.showNotification(title, options)
          else new Notification(title, options)
        } catch { /* notification blocked by the browser */ }
      }
      // Forget entries older than 3 days.
      const cutoff = Date.now() - 3 * 86_400_000
      for (const k of Object.keys(fired)) if (fired[k] < cutoff) delete fired[k]
      writeFired(fired)
    }
    run()
    const id = window.setInterval(run, 30_000)
    return () => window.clearInterval(id)
  }, [reminders, profile?.quiet_hours_start, profile?.quiet_hours_end])

  return null
}
