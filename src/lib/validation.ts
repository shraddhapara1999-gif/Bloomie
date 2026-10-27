import { z } from 'zod'
import { MAX_JOURNAL, MAX_NOTE } from './constants'

// Client-side validation mirrors the database CHECK constraints, which remain
// the source of truth on the server.

export const emailSchema = z.string().trim().min(1, 'Please enter your email').email('Please enter a valid email address')

export const passwordSchema = z.string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number')

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, 'What should we call you?').max(80, 'Keep it under 80 characters'),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: 'Please accept the terms and privacy policy to continue' }),
})

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Please enter your password'),
})

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirm: z.string(),
}).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

const level = z.number().int().min(1).max(5)

export const moodEntrySchema = z.object({
  mood_score: z.number({ error: 'Please choose how you are feeling overall' }).int().min(1).max(5),
  emotion_tags: z.array(z.string().max(30)).max(12),
  energy_level: level.nullable(),
  focus_level: level.nullable(),
  stress_level: level.nullable(),
  sleep_quality: level.nullable(),
  body_signals: z.object({
    period_flow: z.string().max(20).optional(),
    symptoms: z.array(z.string().max(40)).max(20).optional(),
  }).nullable(),
  habits: z.object({
    meds_taken: z.boolean().optional(),
    movement: z.string().max(40).optional(),
    water_met: z.boolean().optional(),
  }).nullable(),
  optional_note: z.string().max(MAX_NOTE, `Notes can be up to ${MAX_NOTE} characters`).nullable(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type MoodEntryInput = z.infer<typeof moodEntrySchema>

export const journalEntrySchema = z.object({
  title: z.string().trim().max(200, 'Titles can be up to 200 characters'),
  content: z.string().trim().min(1, 'Write at least a few words').max(MAX_JOURNAL, `Entries can be up to ${MAX_JOURNAL.toLocaleString()} characters`),
  entry_type: z.enum(['daily', 'gratitude', 'mood', 'stressor', 'reflection']),
  prompt: z.string().max(300).nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20, 'Up to 20 tags'),
  optional_mood_entry_id: z.string().uuid().nullable(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
})
export type JournalEntryInput = z.infer<typeof journalEntrySchema>

export const reminderSchema = z.object({
  reminder_type: z.enum(['meditation', 'journal', 'mood_checkin', 'custom']),
  label: z.string().trim().max(80, 'Keep the label under 80 characters'),
  scheduled_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Choose a time'),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one day').max(7),
  timezone: z.string().min(1).max(64),
  enabled: z.boolean(),
  notification_channel: z.enum(['browser', 'email', 'push']),
})
export type ReminderInput = z.infer<typeof reminderSchema>

export const profileSchema = z.object({
  display_name: z.string().trim().min(1, 'Please enter a name').max(80),
  timezone: z.string().min(1).max(64),
})

/** Map a ZodError to { field: message } for inline form errors. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
