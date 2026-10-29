import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation, useNavigate, useRouteError, isRouteErrorResponse } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from './auth/AuthProvider'
import { AppShell } from './components/AppShell'
import { BloomieMascot, FloralBg } from './components/brand'
import { Button } from './components/ui'
import { HelpContent } from './components/Safety'
import { configStatus } from './lib/env'
import { logClientError } from './services/account'
import { AuthCallbackPage, ForgotPasswordPage, ResetPasswordPage, SignInPage, SignUpPage } from './pages/auth/AuthPages'
import { LandingPage, LegalLayout, NotFoundPage, PrivacyPage, SetupRequiredPage, TermsPage } from './pages/PublicPages'
import { LoadingBlock, PageHeader } from './components/ui'

// Each page is its own chunk so the first load stays small on mobile.
const OnboardingPage = lazy(() => import('./pages/Onboarding').then(m => ({ default: m.OnboardingPage })))
const DashboardPage = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.DashboardPage })))
const CheckInPage = lazy(() => import('./pages/CheckIn').then(m => ({ default: m.CheckInPage })))
const MeditationLibraryPage = lazy(() => import('./pages/Meditate').then(m => ({ default: m.MeditationLibraryPage })))
const MeditationPlayerPage = lazy(() => import('./pages/Meditate').then(m => ({ default: m.MeditationPlayerPage })))
const ExerciseLibraryPage = lazy(() => import('./pages/Exercises').then(m => ({ default: m.ExerciseLibraryPage })))
const ExercisePlayerPage = lazy(() => import('./pages/Exercises').then(m => ({ default: m.ExercisePlayerPage })))
const JournalListPage = lazy(() => import('./pages/Journal').then(m => ({ default: m.JournalListPage })))
const JournalEditorPage = lazy(() => import('./pages/Journal').then(m => ({ default: m.JournalEditorPage })))
const JournalDetailPage = lazy(() => import('./pages/Journal').then(m => ({ default: m.JournalDetailPage })))
const RemindersPage = lazy(() => import('./pages/Reminders').then(m => ({ default: m.RemindersPage })))
const ProgressPage = lazy(() => import('./pages/Progress').then(m => ({ default: m.ProgressPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })))
const TalkPage = lazy(() => import('./pages/Talk').then(m => ({ default: m.TalkPage })))

const page = (el: ReactNode) => <Suspense fallback={<LoadingBlock label="Loading page…" />}>{el}</Suspense>

function Splash() {
  return (
    <div className="min-h-dvh grid place-items-center" role="status" aria-live="polite">
      <FloralBg />
      <div className="relative flex flex-col items-center gap-2 animate-pulse">
        <BloomieMascot size={64} />
        <span className="text-sm text-muted-foreground">Loading Bloomie…</span>
      </div>
    </div>
  )
}

function RouteError() {
  const error = useRouteError()
  const nav = useNavigate()
  const location = useLocation()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  useEffect(() => {
    if (!notFound) logClientError(error instanceof Error ? error.message : String(error), location.pathname, configStatus.config?.release ?? 'dev')
  }, [error, notFound, location.pathname])
  if (notFound) return <NotFoundPage />
  return (
    <div className="min-h-dvh grid place-items-center px-4">
      <FloralBg />
      <div className="relative glass rounded-3xl p-6 max-w-sm text-center" role="alert">
        <BloomieMascot size={64} className="mx-auto" />
        <h1 className="text-xl font-extrabold mt-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mt-1">Sorry about that. Your saved entries are safe. Please try again.</p>
        <div className="flex gap-2 justify-center mt-4">
          <Button variant="soft" onClick={() => nav('/app')}>Go home</Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    </div>
  )
}

/** Protects private routes and routes new users through onboarding. */
function RequireAuth({ allowIncomplete = false }: { allowIncomplete?: boolean }) {
  const { session, loading, profile, profileLoading, profileError, recovering } = useAuth()
  const location = useLocation()
  const nav = useNavigate()

  // Surface one-off messages passed through navigation state.
  useEffect(() => {
    const msg = (location.state as { toast?: string } | null)?.toast
    if (msg) { toast.success(msg); nav(location.pathname + location.search, { replace: true, state: null }) }
  }, [location, nav])

  if (loading || (session && profileLoading)) return <Splash />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (recovering && location.pathname !== '/reset-password') return <Navigate to="/reset-password" replace />
  if (profileError) {
    return (
      <div className="min-h-dvh grid place-items-center px-4"><div className="glass rounded-3xl p-6 max-w-sm text-center" role="alert">
        <h1 className="text-xl font-extrabold">We couldn't load your profile</h1>
        <p className="text-sm text-muted-foreground mt-1">{profileError.message}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>Try again</Button>
      </div></div>
    )
  }
  if (!allowIncomplete && profile && !profile.onboarding_completed_at) return <Navigate to="/onboarding" replace />
  return <Outlet />
}

function InAppHelp() {
  return (<><PageHeader title="Help & support" subtitle="You deserve support. Here's where to find it." /><HelpContent /></>)
}

function PublicHelp() {
  return <LegalLayout title="Help & support" updated="27 October 2026"><div className="mt-4"><HelpContent /></div></LegalLayout>
}

const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/login', element: <SignInPage /> },
      { path: '/signup', element: <SignUpPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/help', element: <PublicHelp /> },
      {
        element: <RequireAuth allowIncomplete />,
        children: [{ path: '/onboarding', element: <Suspense fallback={<Splash />}><OnboardingPage /></Suspense> }],
      },
      {
        element: <RequireAuth />,
        children: [{
          path: '/app',
          element: <AppShell />,
          errorElement: <RouteError />,
          children: [
            { index: true, element: page(<DashboardPage />) },
            { path: 'check-in', element: page(<CheckInPage />) },
            { path: 'meditate', element: page(<MeditationLibraryPage />) },
            { path: 'meditate/:slug', element: page(<MeditationPlayerPage />) },
            { path: 'exercises', element: page(<ExerciseLibraryPage />) },
            { path: 'exercises/:slug', element: page(<ExercisePlayerPage />) },
            { path: 'journal', element: page(<JournalListPage />) },
            { path: 'journal/new', element: page(<JournalEditorPage />) },
            { path: 'journal/:id', element: page(<JournalDetailPage />) },
            { path: 'journal/:id/edit', element: page(<JournalEditorPage />) },
            { path: 'reminders', element: page(<RemindersPage />) },
            { path: 'progress', element: page(<ProgressPage />) },
            { path: 'settings', element: page(<SettingsPage />) },
            { path: 'talk', element: page(<TalkPage />) },
            { path: 'help', element: <InAppHelp /> },
          ],
        }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  if (!configStatus.ok) return <SetupRequiredPage />
  return <RouterProvider router={router} />
}
