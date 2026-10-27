// Only public, browser-safe values belong here (VITE_ prefix). The Supabase
// anon key is designed to be public; data access is protected by RLS.
// Never put a service-role key or third-party secret in a VITE_ variable.

export interface PublicConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  vapidPublicKey: string | null
  release: string
}

export interface ConfigStatus {
  ok: boolean
  missing: string[]
  config: PublicConfig | null
}

export function readConfig(env: Record<string, string | undefined> = import.meta.env): ConfigStatus {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const key = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  const missing: string[] = []
  if (!url || url.includes('your-project')) missing.push('VITE_SUPABASE_URL')
  if (!key || key.includes('your-anon-key')) missing.push('VITE_SUPABASE_ANON_KEY')
  if (url && !/^https?:\/\//.test(url)) missing.push('VITE_SUPABASE_URL (must start with https://)')
  if (missing.length) return { ok: false, missing, config: null }
  return {
    ok: true,
    missing: [],
    config: {
      supabaseUrl: url,
      supabaseAnonKey: key,
      vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY?.trim() || null,
      release: env.VITE_APP_RELEASE?.trim() || 'dev',
    },
  }
}

export const configStatus = readConfig()
