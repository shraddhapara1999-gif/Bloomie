// Simple, transparent personalisation rules. No profiling beyond the user's own
// stated preferences and their most recent check-in.
import type { Exercise, MeditationCategory, MeditationSession } from './types'

export interface RecommendContext {
  goals: string[]
  preferredMinutes: number
  latestMood: { mood_score: number; stress_level: number | null; emotion_tags: string[] } | null
  hour: number
}

const GOAL_TO_CATEGORY: Record<string, MeditationCategory> = {
  stress: 'stress', sleep: 'sleep', focus: 'focus', gratitude: 'gratitude', awareness: 'mindfulness', habits: 'beginner',
}

export function preferredCategories(ctx: RecommendContext): MeditationCategory[] {
  const out: MeditationCategory[] = []
  const m = ctx.latestMood
  if (ctx.hour >= 21 || ctx.hour < 4) out.push('sleep')
  if (m && ((m.stress_level ?? 0) >= 4 || m.emotion_tags.some(t => ['anxious', 'jittery', 'frustrated'].includes(t)))) out.push('stress', 'breathing')
  if (m && m.mood_score <= 2) out.push('stress', 'body')
  if (m?.emotion_tags.includes('tired')) out.push('body', 'sleep')
  for (const g of ctx.goals) if (GOAL_TO_CATEGORY[g]) out.push(GOAL_TO_CATEGORY[g])
  out.push('beginner', 'mindfulness', 'breathing')
  return [...new Set(out)]
}

export function recommendMeditations(sessions: MeditationSession[], ctx: RecommendContext, limit = 3): MeditationSession[] {
  const cats = preferredCategories(ctx)
  const target = ctx.preferredMinutes * 60
  const score = (s: MeditationSession) => {
    const ci = cats.indexOf(s.category)
    const catScore = ci === -1 ? 50 : ci * 5
    const durScore = Math.abs(s.duration_seconds - target) / 60
    return catScore + durScore
  }
  return [...sessions].sort((a, b) => score(a) - score(b) || a.title.localeCompare(b.title)).slice(0, limit)
}

export function recommendExercises(exercises: Exercise[], ctx: RecommendContext, limit = 2): Exercise[] {
  const m = ctx.latestMood
  const prefs: string[] = []
  if (ctx.hour >= 21 || ctx.hour < 4) prefs.push('sleep')
  if (m && ((m.stress_level ?? 0) >= 4 || m.emotion_tags.includes('anxious'))) prefs.push('grounding', 'breathing')
  if (m && m.mood_score <= 2) prefs.push('grounding', 'relaxation')
  if (ctx.goals.includes('gratitude')) prefs.push('gratitude')
  if (ctx.goals.includes('awareness')) prefs.push('reflection')
  prefs.push('breathing', 'mindfulness', 'body')
  const rank = (e: Exercise) => { const i = prefs.indexOf(e.category); return i === -1 ? 99 : i }
  return [...exercises].sort((a, b) => rank(a) - rank(b) || a.duration_seconds - b.duration_seconds).slice(0, limit)
}

export function dailyTip(ctx: RecommendContext): { title: string; body: string } {
  const m = ctx.latestMood
  if (!m) return { title: 'Start with a check-in', body: 'Taking a few seconds to notice how you feel is a great first step.' }
  if ((m.stress_level ?? 0) >= 4) return { title: 'Soften the edges', body: 'Stress feels high today. A few minutes of slow breathing with a longer exhale may help you settle.' }
  if (m.mood_score <= 2) return { title: 'Be gentle with yourself', body: 'It sounds like a harder day. Something small and kind — a short walk, water, or a grounding exercise — counts.' }
  if (m.emotion_tags.includes('tired')) return { title: 'Rest is allowed', body: 'Feeling tired? A body scan or an early wind-down tonight could be a kind choice.' }
  if (ctx.hour >= 20) return { title: 'Wind down', body: 'Evening is a good time to close the day: jot down one thing you appreciated.' }
  return { title: 'Keep the good going', body: 'You are doing well. A short gratitude moment can help you notice what is working.' }
}
