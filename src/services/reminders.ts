import { check, db } from '../lib/supabase'
import type { Reminder, ReminderDelivery } from '../lib/types'
import { reminderSchema, type ReminderInput } from '../lib/validation'

export async function listReminders(): Promise<Reminder[]> {
  return check(await db().from('reminders').select('*').order('scheduled_time')) as Reminder[]
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  return check(await db().from('reminders').insert(reminderSchema.parse(input)).select('*').single()) as Reminder
}

export async function updateReminder(id: string, input: Partial<ReminderInput>): Promise<Reminder> {
  const parsed = reminderSchema.partial().parse(input)
  return check(await db().from('reminders').update(parsed).eq('id', id).select('*').single()) as Reminder
}

export async function deleteReminder(id: string): Promise<void> {
  check(await db().from('reminders').delete().eq('id', id))
}

export async function listDeliveries(limit = 20): Promise<ReminderDelivery[]> {
  return check(await db().from('reminder_deliveries').select('*').order('created_at', { ascending: false }).limit(limit)) as ReminderDelivery[]
}

export async function savePushSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  check(await db().from('push_subscriptions').upsert({
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent.slice(0, 300),
  }, { onConflict: 'endpoint' }))
}

export async function deletePushSubscription(endpoint: string) {
  check(await db().from('push_subscriptions').delete().eq('endpoint', endpoint))
}
