import { check, db } from '../lib/supabase'
import type { Affirmation, Exercise, ExerciseHistory, Favorite, MeditationHistory, MeditationSession } from '../lib/types'

// ─── Meditation ─────────────────────────────────────────────────────────────

export async function listMeditations(): Promise<MeditationSession[]> {
  return check(await db().from('meditation_sessions').select('*').eq('is_published', true)
    .order('duration_seconds').order('title')) as MeditationSession[]
}

export async function getMeditation(slug: string): Promise<MeditationSession | null> {
  return check(await db().from('meditation_sessions').select('*').eq('slug', slug).maybeSingle()) as MeditationSession | null
}

export async function startMeditation(sessionId: string): Promise<MeditationHistory> {
  return check(await db().from('meditation_history').insert({ session_id: sessionId }).select('*').single()) as MeditationHistory
}

export async function saveMeditationProgress(id: string, seconds: number, completed: boolean): Promise<void> {
  check(await db().from('meditation_history').update({
    duration_completed_seconds: Math.max(0, Math.round(seconds)),
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  }).eq('id', id))
}

export async function listMeditationHistory(limit = 20): Promise<MeditationHistory[]> {
  return check(await db().from('meditation_history').select('*').order('started_at', { ascending: false }).limit(limit)) as MeditationHistory[]
}

// ─── Exercises ──────────────────────────────────────────────────────────────

export async function listExercises(): Promise<Exercise[]> {
  return check(await db().from('exercises').select('*').eq('is_published', true).order('duration_seconds')) as Exercise[]
}

export async function getExercise(slug: string): Promise<Exercise | null> {
  return check(await db().from('exercises').select('*').eq('slug', slug).maybeSingle()) as Exercise | null
}

export async function startExercise(exerciseId: string): Promise<ExerciseHistory> {
  return check(await db().from('exercise_history').insert({ exercise_id: exerciseId }).select('*').single()) as ExerciseHistory
}

export async function finishExercise(id: string, patch: { completed: boolean; stopped_early: boolean; reflection?: string | null }) {
  check(await db().from('exercise_history').update({
    ...patch,
    completed_at: patch.completed ? new Date().toISOString() : null,
  }).eq('id', id))
}

export async function saveExerciseReflection(id: string, reflection: string) {
  check(await db().from('exercise_history').update({ reflection: reflection.slice(0, 2000) || null }).eq('id', id))
}

export async function listExerciseHistory(limit = 30): Promise<ExerciseHistory[]> {
  return check(await db().from('exercise_history').select('*').order('started_at', { ascending: false }).limit(limit)) as ExerciseHistory[]
}

// ─── Favorites ──────────────────────────────────────────────────────────────

export async function listFavorites(): Promise<Favorite[]> {
  return check(await db().from('user_favorites').select('id, content_type, content_id, created_at')) as Favorite[]
}

export async function setFavorite(type: Favorite['content_type'], contentId: string, on: boolean) {
  if (on) {
    check(await db().from('user_favorites').upsert({ content_type: type, content_id: contentId },
      { onConflict: 'user_id,content_type,content_id', ignoreDuplicates: true }))
  } else {
    check(await db().from('user_favorites').delete().eq('content_type', type).eq('content_id', contentId))
  }
}

// ─── Affirmations ───────────────────────────────────────────────────────────

export async function getDailyAffirmation(localDate: string): Promise<Affirmation | null> {
  const rows = check(await db().rpc('get_daily_affirmation', { p_local_date: localDate })) as Affirmation[] | null
  return rows?.[0] ?? null
}
