import type { JournalType, MeditationCategory, MoodScore, ReminderType } from './types'

// Overall mood levels — neutral, non-clinical wording.
export const MOOD_LEVELS: { score: MoodScore; label: string; emoji: string; color: string }[] = [
  { score: 1, label: 'Rough', emoji: '😣', color: '#a8c5e8' },
  { score: 2, label: 'Low', emoji: '😕', color: '#c8b8e8' },
  { score: 3, label: 'Okay', emoji: '😐', color: '#f5e8b8' },
  { score: 4, label: 'Good', emoji: '🙂', color: '#b8e0b8' },
  { score: 5, label: 'Great', emoji: '😊', color: '#b8d8d8' },
]

export const moodLevel = (score: number) => MOOD_LEVELS.find(m => m.score === score) ?? MOOD_LEVELS[2]

// Emotion tags — from the Figma "Mind & Spirit" carousel, extended.
export const EMOTIONS = [
  { id: 'calm', label: 'Calm', emoji: '😌', bg: '#b8d8d8' },
  { id: 'anxious', label: 'Anxious', emoji: '😟', bg: '#f5d97a' },
  { id: 'down', label: 'Down', emoji: '😢', bg: '#a8c5e8' },
  { id: 'jittery', label: 'Jittery', emoji: '😤', bg: '#f4a57e' },
  { id: 'peaceful', label: 'Peaceful', emoji: '🥰', bg: '#b8e0b8' },
  { id: 'tired', label: 'Tired', emoji: '😴', bg: '#c8b8e8' },
  { id: 'hopeful', label: 'Hopeful', emoji: '✨', bg: '#f5e8b8' },
  { id: 'grateful', label: 'Grateful', emoji: '🙏', bg: '#d8ecc8' },
  { id: 'lonely', label: 'Lonely', emoji: '🫥', bg: '#d0d8e8' },
  { id: 'frustrated', label: 'Frustrated', emoji: '😠', bg: '#f4b8a8' },
] as const

export const emotion = (id: string) => EMOTIONS.find(e => e.id === id)

export const FOG_LABELS: Record<number, { label: string; icon: string }> = {
  1: { label: 'Crystal Clear', icon: '🌱' },
  2: { label: 'Light Haze', icon: '🌿' },
  3: { label: 'Some Fog', icon: '🌤️' },
  4: { label: 'Heavy Cloud', icon: '⛅' },
  5: { label: 'Total Fog', icon: '🌧️' },
}

export const STRESS_LABELS = ['', '😌 Low', '🙂 Mild', '😐 Medium', '😰 High', '🌊 Very High']
export const SLEEP_LABELS = ['', 'Very poor rest', 'Poor rest', 'Average sleep', 'Good sleep', 'Restful sleep']

export const PERIOD_FLOWS = ['None', 'Spotting', 'Light', 'Medium', 'Heavy']
export const FLOW_COLORS: Record<string, string> = {
  None: '#d0e8e2', Spotting: '#f9ddd8', Light: '#f4b8b0', Medium: '#e89088', Heavy: '#d86860',
}
export const SYMPTOMS = ['Bloating', 'Cravings', 'Cramps', 'Headache', 'Acne flare-up', 'Tired', 'Irritable', 'Tender']
export const MOVEMENT_OPTIONS = ['Rest', 'Walking', 'Gentle Yoga', 'Pilates', 'Stretching', 'Strength Training', 'Swimming', 'Dancing']

export const MEDITATION_CATEGORIES: { id: MeditationCategory; label: string; emoji: string }[] = [
  { id: 'beginner', label: 'Beginner', emoji: '🌱' },
  { id: 'breathing', label: 'Breathing', emoji: '🌬️' },
  { id: 'mindfulness', label: 'Mindfulness', emoji: '🍃' },
  { id: 'stress', label: 'Stress relief', emoji: '🌊' },
  { id: 'sleep', label: 'Sleep', emoji: '🌙' },
  { id: 'focus', label: 'Focus', emoji: '🎯' },
  { id: 'gratitude', label: 'Gratitude', emoji: '🌸' },
  { id: 'body', label: 'Body', emoji: '🫶' },
]

export const DURATION_FILTERS = [2, 5, 10, 15, 20]

export const JOURNAL_TYPES: { id: JournalType; label: string; emoji: string }[] = [
  { id: 'daily', label: 'Daily diary', emoji: '📔' },
  { id: 'gratitude', label: 'Gratitude', emoji: '🌸' },
  { id: 'mood', label: 'Mood', emoji: '🌤️' },
  { id: 'stressor', label: 'Stressor', emoji: '🌊' },
  { id: 'reflection', label: 'Reflection', emoji: '🪞' },
]

export const JOURNAL_PROMPTS: { text: string; type: JournalType }[] = [
  { text: 'What is one thing I appreciate today?', type: 'gratitude' },
  { text: 'What emotion am I experiencing right now?', type: 'mood' },
  { text: 'What made today easier or more difficult?', type: 'daily' },
  { text: 'What is one thing I can let go of?', type: 'reflection' },
  { text: 'What is one small thing I can do for myself tomorrow?', type: 'reflection' },
  { text: 'What is weighing on me, and what part of it is within my control?', type: 'stressor' },
  { text: 'Who made me smile recently, and why?', type: 'gratitude' },
  { text: 'What did my body need today? Did it get it?', type: 'daily' },
  { text: 'What would I tell a friend who felt the way I feel right now?', type: 'reflection' },
  { text: 'Three small things that went okay today were…', type: 'gratitude' },
]

export const WELLNESS_GOALS = [
  { id: 'stress', label: 'Manage stress', emoji: '🌊' },
  { id: 'sleep', label: 'Sleep better', emoji: '🌙' },
  { id: 'focus', label: 'Improve focus', emoji: '🎯' },
  { id: 'gratitude', label: 'Practise gratitude', emoji: '🌸' },
  { id: 'awareness', label: 'Understand my emotions', emoji: '🪞' },
  { id: 'habits', label: 'Build calm habits', emoji: '🌿' },
]

export const REMINDER_TYPES: { id: ReminderType; label: string; emoji: string; defaultLabel: string }[] = [
  { id: 'mood_checkin', label: 'Mood check-in', emoji: '🌤️', defaultLabel: 'How are you feeling?' },
  { id: 'meditation', label: 'Meditation', emoji: '🧘', defaultLabel: 'Time for a mindful pause' },
  { id: 'journal', label: 'Journaling', emoji: '📔', defaultLabel: 'A few words for your journal' },
  { id: 'custom', label: 'Custom', emoji: '🔔', defaultLabel: 'Gentle reminder' },
]

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const MAX_NOTE = 2000
export const MAX_JOURNAL = 20000
