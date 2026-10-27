import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { BookHeart, CalendarCheck, Flower2, LineChart, Lock, Sparkles } from 'lucide-react'
import { BloomieMascot, FloralBg, Wordmark } from '../components/brand'
import { ButtonLink, Card } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { configStatus } from '../lib/env'

export function LandingPage() {
  const { session, loading } = useAuth()
  if (!loading && session) return <Navigate to="/app" replace />
  const features = [
    { icon: CalendarCheck, title: 'Gentle check-ins', body: 'Notice your mood, energy and body in under a minute.' },
    { icon: Flower2, title: 'Guided meditation', body: 'Breathing, sleep, focus and stress-relief sessions from 2 to 20 minutes.' },
    { icon: BookHeart, title: 'Private journal', body: 'Prompts for gratitude and reflection. Only you can read it.' },
    { icon: Sparkles, title: 'Calming exercises', body: 'Box breathing, grounding, body scans and more, step by step.' },
    { icon: LineChart, title: 'Your patterns', body: 'See your own trends over time, without judgement.' },
    { icon: Lock, title: 'Private by design', body: 'Your data is protected per account and never sold.' },
  ]
  return (
    <div className="min-h-dvh relative">
      <FloralBg />
      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        <header className="flex items-center justify-between py-5">
          <Link to="/" className="flex items-center gap-1.5"><BloomieMascot size={36} /><Wordmark size="sm" /></Link>
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <Link to="/login" className="px-3 py-2 rounded-xl hover:bg-white/60">Sign in</Link>
            <ButtonLink to="/signup" className="!py-2">Get started</ButtonLink>
          </nav>
        </header>
        <main>
          <section className="grid md:grid-cols-2 gap-8 items-center py-10 sm:py-16">
            <div className="animate-fade-up">
              <p className="inline-block rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-primary-strong mb-4">Your calm companion 🌱</p>
              <h1 className="text-4xl sm:text-5xl font-black leading-tight">Small moments of care, every day.</h1>
              <p className="text-lg text-muted-foreground mt-4 max-w-md">Check in with yourself, breathe, reflect and notice your patterns — gently, at your own pace.</p>
              <div className="flex flex-wrap gap-3 mt-6">
                <ButtonLink to="/signup">Create a free account</ButtonLink>
                <ButtonLink to="/login" variant="outline">I already have one</ButtonLink>
              </div>
            </div>
            <div className="glass rounded-3xl p-6 flex flex-col items-center text-center gap-3">
              <BloomieMascot size={120} />
              <p className="font-display font-extrabold text-xl text-primary-strong">“You showed up for yourself today. That truly matters.”</p>
              <p className="text-sm text-muted-foreground">— Bloomie</p>
            </div>
          </section>
          <section aria-labelledby="features" className="pb-12">
            <h2 id="features" className="sr-only">Features</h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map(f => (
                <Card as="li" key={f.title}>
                  <f.icon className="size-6 text-primary-strong mb-2" aria-hidden />
                  <h3 className="font-bold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{f.body}</p>
                </Card>
              ))}
            </ul>
          </section>
        </main>
        <SiteFooter />
      </div>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 py-6 text-xs text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 justify-between">
      <p>Bloomie supports everyday wellbeing and is not a substitute for professional care. In an emergency in India, call 112.</p>
      <nav className="flex gap-4 font-semibold">
        <Link to="/privacy" className="hover:underline">Privacy</Link>
        <Link to="/terms" className="hover:underline">Terms</Link>
        <Link to="/help" className="hover:underline">Get help</Link>
      </nav>
    </footer>
  )
}

export function SetupRequiredPage() {
  return (
    <div className="min-h-dvh relative grid place-items-center px-4 py-10">
      <FloralBg />
      <main className="relative z-10 max-w-lg w-full glass rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-3"><BloomieMascot size={48} /><h1 className="text-2xl font-extrabold">Almost there</h1></div>
        <p className="text-sm">Bloomie is not connected to its backend yet, so nothing can be saved. To finish setup:</p>
        <ol className="list-decimal pl-5 text-sm space-y-1.5 mt-3">
          <li>Copy <code className="bg-muted px-1 rounded">.env.example</code> to <code className="bg-muted px-1 rounded">.env.local</code>.</li>
          <li>Add your Supabase project URL and anon (public) key.</li>
          <li>Restart the dev server.</li>
        </ol>
        <p className="text-sm mt-3">Missing:</p>
        <ul className="mt-1 text-sm font-mono">
          {configStatus.missing.map(m => <li key={m} className="text-danger">• {m}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground mt-4">See <strong>docs/SETUP.md</strong> for the full guide.</p>
      </main>
    </div>
  )
}

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh relative">
      <FloralBg />
      <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 mb-6"><BloomieMascot size={32} /><Wordmark size="sm" /></Link>
        <article className="bg-card rounded-3xl p-6 sm:p-8 shadow-[var(--shadow-card)] [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:mt-6 [&_h2]:mb-2 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-3 [&_li]:text-sm [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:mb-3">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          <p className="!text-xs text-muted-foreground">Last updated {updated} · Template — must be reviewed by a qualified legal professional before launch.</p>
          {children}
        </article>
        <SiteFooter />
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="27 October 2026">
      <h2>Summary</h2>
      <ul>
        <li>Your journal, mood check-ins and activity are private to your account.</li>
        <li>We never sell your personal data or use your journal for advertising.</li>
        <li>Optional AI features are off by default and only process data after you opt in.</li>
        <li>You can export or permanently delete your data at any time from Settings.</li>
      </ul>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your name, email address and an encrypted password (managed by our authentication provider).</li>
        <li><strong>Wellness entries you choose to create:</strong> mood check-ins, emotion tags, optional notes, optional cycle and body signals, journal entries, meditation and exercise history, reminders and favourites.</li>
        <li><strong>Preferences:</strong> goals, timezone, reminder and notification settings.</li>
        <li><strong>Technical:</strong> minimal error reports (error message and page only — never the contents of your entries).</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to provide the app to you: saving your entries, showing your own reports, sending reminders you set up, and keeping the service secure. Health-related information you enter is sensitive personal data; we process it on the basis of your explicit consent, which you can withdraw by deleting the data or your account.</p>
      <h2>Where it is stored</h2>
      <p>Data is stored in a managed PostgreSQL database (Supabase) with row-level security so that each account can only access its own records. Data is encrypted in transit (TLS) and at rest by the hosting provider. [Specify hosting region.]</p>
      <h2>Sharing</h2>
      <p>We share data only with service providers needed to run Bloomie (hosting, authentication, email delivery and — only if you opt in — an AI provider). They process data on our instructions. We do not sell or rent personal data.</p>
      <h2>Optional AI features</h2>
      <p>If you turn on AI features in Settings, the specific text needed for that feature is sent to our AI provider to generate a response. Journal text is never sent unless you explicitly choose to include it. AI responses are not medical advice.</p>
      <h2>Retention &amp; deletion</h2>
      <p>We keep your data while your account is active. Deleting an entry removes it from your account immediately. Deleting your account permanently removes your profile and all associated entries. Backups are overwritten on a rolling basis [specify period].</p>
      <h2>Your rights</h2>
      <p>You can access, export, correct and delete your data in the app. Depending on where you live (for example under India's Digital Personal Data Protection Act, 2023 or the GDPR) you may have additional rights. Contact [privacy contact email].</p>
      <h2>Children</h2>
      <p>Bloomie is intended for people aged 18 and over.</p>
      <h2>Contact</h2>
      <p>[Company name, address, grievance officer and contact email.]</p>
    </LegalLayout>
  )
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="27 October 2026">
      <h2>Not medical care</h2>
      <p>Bloomie offers general wellbeing tools such as mood tracking, meditation and journaling. It does not provide medical, psychological or psychiatric diagnosis or treatment and is not a substitute for a qualified professional. If you are in crisis or may be in danger, contact local emergency services (112 in India) or a crisis helpline immediately.</p>
      <h2>Your account</h2>
      <p>You must be 18 or older and provide accurate information. Keep your password secure; you are responsible for activity under your account.</p>
      <h2>Your content</h2>
      <p>You own what you write. You give us permission to store and process it only to provide the service to you.</p>
      <h2>Acceptable use</h2>
      <p>Do not misuse the service, attempt to access other users' data, or interfere with its operation.</p>
      <h2>Exercises and meditation</h2>
      <p>Stop any exercise that causes discomfort, dizziness or distress. Breathing exercises are optional and can be done at a gentler pace.</p>
      <h2>Changes and termination</h2>
      <p>We may update these terms and will notify you of material changes. You can delete your account at any time.</p>
      <h2>Liability</h2>
      <p>[To be completed by legal counsel for your jurisdiction.]</p>
      <h2>Contact</h2>
      <p>[Company name and contact email.]</p>
    </LegalLayout>
  )
}

export function NotFoundPage() {
  return (
    <div className="min-h-dvh relative grid place-items-center px-4">
      <FloralBg />
      <main className="relative z-10 text-center glass rounded-3xl p-8 max-w-sm">
        <BloomieMascot size={72} className="mx-auto" />
        <h1 className="text-2xl font-extrabold mt-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-4">This page has wandered off. Let's get you back.</p>
        <ButtonLink to="/">Go home</ButtonLink>
      </main>
    </div>
  )
}
