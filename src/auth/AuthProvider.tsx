import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getProfile } from '../services/profile'
import type { Profile } from '../lib/types'
import { browserTimezone, isValidTimezone } from '../lib/dates'

interface AuthState {
  session: Session | null
  user: User | null
  /** True until the initial session has been restored from storage. */
  loading: boolean
  profile: Profile | null
  profileLoading: boolean
  profileError: Error | null
  timezone: string
  /** Set after the user follows a password-recovery link. */
  recovering: boolean
  clearRecovering: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') qc.clear()
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [qc])

  const userId = session?.user.id
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  })

  const value = useMemo<AuthState>(() => {
    const profile = profileQuery.data ?? null
    const tz = profile?.timezone && isValidTimezone(profile.timezone) ? profile.timezone : browserTimezone()
    return {
      session,
      user: session?.user ?? null,
      loading,
      profile,
      profileLoading: !!userId && profileQuery.isPending,
      profileError: profileQuery.error,
      timezone: tz,
      recovering,
      clearRecovering: () => setRecovering(false),
      signOut: async () => {
        await supabase?.auth.signOut()
        qc.clear()
      },
    }
  }, [session, loading, profileQuery.data, profileQuery.isPending, profileQuery.error, userId, recovering, qc])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
