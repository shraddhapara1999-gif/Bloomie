import { check, db } from '../lib/supabase'
import type { OnboardingPreferences, Profile } from '../lib/types'

export async function getProfile(userId: string): Promise<Profile | null> {
  return check(await db().from('profiles').select('*').eq('id', userId).maybeSingle()) as Profile | null
}

export type ProfileUpdate = Partial<Pick<Profile,
  'display_name' | 'timezone' | 'onboarding_preferences' | 'onboarding_completed_at' |
  'email_notifications' | 'quiet_hours_start' | 'quiet_hours_end' | 'ai_opt_in' | 'ai_opt_in_at'>>

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  return check(await db().from('profiles').update(patch).eq('id', userId).select('*').single()) as Profile
}

export async function savePreferences(userId: string, current: OnboardingPreferences, patch: OnboardingPreferences) {
  return updateProfile(userId, { onboarding_preferences: { ...current, ...patch } })
}
