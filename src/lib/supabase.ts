import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { configStatus } from './env'

// `null` when the app is not configured — the UI shows a setup screen instead.
export const supabase: SupabaseClient | null = configStatus.config
  ? createClient(configStatus.config.supabaseUrl, configStatus.config.supabaseAnonKey, {
      // Implicit flow: email verification and password-reset links work in any
      // browser or device, not only the one where the email was requested.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Bloomie is not connected to a backend yet.')
  return supabase
}

/** Throw a friendly Error for a Supabase error result. */
export function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw toFriendlyError(res.error)
  return res.data
}

export function toFriendlyError(err: { message: string; code?: string; status?: number }): Error {
  const msg = err.message || 'Something went wrong'
  if (/JWT expired|invalid JWT|refresh_token/i.test(msg) || err.code === 'PGRST301') {
    return new Error('Your session has expired. Please sign in again.')
  }
  if (/Failed to fetch|NetworkError|network/i.test(msg)) {
    return new Error('We could not reach the server. Check your connection and try again.')
  }
  if (err.code === '23514') return new Error('Some of the values are not valid. Please check and try again.')
  if (err.code === '42501' || /row-level security/i.test(msg)) {
    return new Error('You do not have permission to do that.')
  }
  return new Error(msg)
}
