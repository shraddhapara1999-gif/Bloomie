import { NavLink, Outlet, Link, useLocation } from 'react-router'
import { BarChart3, BookHeart, Flower2, Home, LifeBuoy, MessageCircleHeart, Settings, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { BloomieMascot, FloralBg } from './brand'
import { useAuth } from '../auth/AuthProvider'
import { ReminderRunner } from './ReminderRunner'

const NAV = [
  { to: '/app', label: 'Home', icon: Home, end: true },
  { to: '/app/meditate', label: 'Meditate', icon: Flower2 },
  { to: '/app/journal', label: 'Journal', icon: BookHeart },
  { to: '/app/exercises', label: 'Practice', icon: Sparkles },
  { to: '/app/talk', label: 'Talk', icon: MessageCircleHeart },
  { to: '/app/progress', label: 'Progress', icon: BarChart3 },
]

export function AppShell() {
  const { profile } = useAuth()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // Move focus to the page on navigation so screen readers announce it.
  useEffect(() => {
    window.scrollTo({ top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [location.pathname])

  const initial = (profile?.display_name || '?').trim().charAt(0).toUpperCase()

  return (
    <div className="min-h-dvh relative">
      <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-50 bg-white px-3 py-2 rounded-xl font-semibold">Skip to content</a>
      <FloralBg />
      <ReminderRunner />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col gap-1 p-5 z-20 glass rounded-none border-y-0 border-l-0">
        <Link to="/app" className="flex items-center gap-2 mb-6 px-2">
          <BloomieMascot size={40} />
          <span className="text-2xl font-black font-display text-primary-strong">Bloomie</span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition',
                isActive ? 'bg-white text-primary-strong shadow-sm' : 'text-muted-foreground hover:bg-white/60 hover:text-foreground')}>
              <n.icon className="size-5" aria-hidden /> {n.label}
            </NavLink>
          ))}
          <div className="h-px bg-border my-3" />
          <NavLink to="/app/reminders" className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition', isActive ? 'bg-white text-primary-strong' : 'text-muted-foreground hover:bg-white/60')}>
            <span aria-hidden className="w-5 text-center">🔔</span> Reminders
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition', isActive ? 'bg-white text-primary-strong' : 'text-muted-foreground hover:bg-white/60')}>
            <Settings className="size-5" aria-hidden /> Settings
          </NavLink>
          <NavLink to="/app/help" className={({ isActive }) => clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition', isActive ? 'bg-white text-primary-strong' : 'text-muted-foreground hover:bg-white/60')}>
            <LifeBuoy className="size-5" aria-hidden /> Help &amp; support
          </NavLink>
        </nav>
        <p className="mt-auto text-[11px] text-muted-foreground px-2 leading-snug">
          Bloomie supports everyday wellbeing and is not a substitute for professional care.
        </p>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 bg-background/80 backdrop-blur-md">
        <Link to="/app" className="flex items-center gap-1.5" aria-label="Bloomie home">
          <BloomieMascot size={32} />
          <span className="text-xl font-black font-display text-primary-strong">Bloomie</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link to="/app/help" className="p-2.5 rounded-full hover:bg-white/60 text-primary-strong" aria-label="Help and crisis support">
            <LifeBuoy className="size-5" />
          </Link>
          <Link to="/app/settings" className="size-9 rounded-full bg-primary-strong text-white font-bold grid place-items-center text-sm" aria-label="Settings and profile">
            {initial}
          </Link>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="relative z-10 outline-none lg:pl-60">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-4 lg:pt-10 pb-28 lg:pb-12">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-md border-t border-border pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-6">
          {NAV.map(n => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end}
                className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-semibold transition', isActive ? 'text-primary-strong' : 'text-muted-foreground')}>
                {({ isActive }) => (
                  <>
                    <span className={clsx('px-2.5 py-1 rounded-full transition', isActive && 'bg-muted')}><n.icon className="size-5" aria-hidden /></span>
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
