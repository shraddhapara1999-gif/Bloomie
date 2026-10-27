import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import { registerServiceWorker } from './lib/push'
import { logClientError } from './services/account'
import { configStatus } from './lib/env'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: async error => {
      // An expired/invalid session surfaces as an auth error: sign out cleanly.
      if (/session has expired/i.test(error.message)) {
        await supabase?.auth.signOut({ scope: 'local' })
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => count < 2 && !/permission|expired/i.test((error as Error).message),
      refetchOnWindowFocus: true,
    },
    mutations: { retry: 0 },
  },
})

window.addEventListener('unhandledrejection', e => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason)
  void logClientError(msg, location.pathname, configStatus.config?.release ?? 'dev')
})

if (import.meta.env.PROD) void registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: 'Outfit, sans-serif', borderRadius: 16 } }} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
