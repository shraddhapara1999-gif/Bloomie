export type MoodScore = 1 | 2 | 3 | 4 | 5

export interface OnboardingPreferences {
  goals?: string[]
  focus_areas?: string[]
  meditation_minutes?: number
  reminder_times?: string[]
  journaling_style?: 'free' | 'prompts' | 'gratitude' | 'mixed'
  track_body_signals?: boolean
  speak_guidance?: boolean
  ambient_sound?: 'off' | 'soft-noise' | 'warm-tone'
  gentle_breathing?: boolean
}

export interface Profile {
  id: string
  display_name: string
  timezone: string
  onboarding_preferences: OnboardingPreferences
  onboarding_completed_at: string | null
  email_notifications: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  ai_opt_in: boolean
  ai_opt_in_at: string | null
  created_at: string
  updated_at: string
}

export interface BodySignals {
  period_flow?: string
  symptoms?: string[]
}

export interface Habits {
  meds_taken?: boolean
  movement?: string
  water_met?: boolean
}

export interface MoodEntry {
  id: string
  user_id: string
  mood_score: MoodScore
  emotion_tags: string[]
  energy_level: number | null
  focus_level: number | null
  stress_level: number | null
  sleep_quality: number | null
  body_signals: BodySignals | null
  habits: Habits | null
  optional_note: string | null
  entry_date: string
  created_at: string
}

export type JournalType = 'daily' | 'gratitude' | 'mood' | 'stressor' | 'reflection'

export interface JournalEntry {
  id: string
  user_id: string
  title: string
  content: string
  entry_type: JournalType
  prompt: string | null
  tags: string[]
  optional_mood_entry_id: string | null
  entry_date: string
  created_at: string
  updated_at: string
}

export interface BreathingPattern {
  inhale: number
  hold: number
  exhale: number
  hold_after: number
}

export type MeditationCategory =
  | 'breathing' | 'mindfulness' | 'sleep' | 'stress' | 'focus' | 'gratitude' | 'body' | 'beginner'

export interface MeditationSession {
  id: string
  slug: string
  title: string
  description: string
  category: MeditationCategory
  duration_seconds: number
  audio_url: string | null
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  breathing_pattern: BreathingPattern | null
  guidance: { at: number; text: string }[]
  tags: string[]
}

export interface MeditationHistory {
  id: string
  user_id: string
  session_id: string
  duration_completed_seconds: number
  completed: boolean
  started_at: string
  completed_at: string | null
}

export interface ExerciseStep {
  title: string
  text: string
  seconds: number
  breathing?: BreathingPattern
  gentle?: BreathingPattern
}

export interface Exercise {
  id: string
  slug: string
  title: string
  description: string
  purpose: string
  category: string
  duration_seconds: number
  instructions: ExerciseStep[]
}

export interface ExerciseHistory {
  id: string
  user_id: string
  exercise_id: string
  completed: boolean
  stopped_early: boolean
  reflection: string | null
  started_at: string
  completed_at: string | null
}

export type ReminderType = 'meditation' | 'journal' | 'mood_checkin' | 'custom'
export type ReminderChannel = 'browser' | 'email' | 'push'

export interface Reminder {
  id: string
  user_id: string
  reminder_type: ReminderType
  label: string
  scheduled_time: string
  days_of_week: number[]
  timezone: string
  enabled: boolean
  notification_channel: ReminderChannel
  last_sent_at: string | null
  created_at: string
}

export interface ReminderDelivery {
  id: string
  reminder_id: string
  channel: string
  status: 'sent' | 'failed' | 'skipped'
  detail: string | null
  scheduled_for: string
  created_at: string
}

export interface Affirmation {
  id: string
  text: string
  category: string
}

export interface Favorite {
  id: string
  content_type: 'meditation' | 'exercise' | 'affirmation'
  content_id: string
  created_at: string
}
