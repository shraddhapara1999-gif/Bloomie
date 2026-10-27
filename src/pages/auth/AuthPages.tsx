import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { BloomieMascot, FloralBg, Wordmark } from '../../components/brand'
import { Button, FormError, TextField } from '../../components/ui'
import { fieldErrors, resetPasswordSchema, signInSchema, signUpSchema, emailSchema } from '../../lib/validation'
import { browserTimezone } from '../../lib/dates'
import { useAuth } from '../../auth/AuthProvider'

const redirectTo = (path: string) => `${window.location.origin}${path}`

function authErrorMessage(e: { message?: string; status?: number; code?: string } | null): string {
  const m = e?.message ?? ''
  if (/invalid login credentials/i.test(m)) return 'That email and password do not match. Please try again.'
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the verification link.'
  if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Try signing in instead.'
  if (/rate limit|too many/i.test(m) || e?.status === 429) return 'Too many attempts. Please wait a minute and try again.'
  if (/weak|pwned/i.test(m)) return 'Please choose a stronger password that has not appeared in a data breach.'
  if (/fetch|network/i.test(m)) return 'We could not reach the server. Check your connection and try again.'
  return m || 'Something went wrong. Please try again.'
}

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh relative flex flex-col items-center justify-start sm:justify-center px-4 py-8">
      <FloralBg />
      <main className="relative z-10 w-full max-w-sm animate-fade-up">
        <Link to="/" className="flex flex-col items-center mb-5" aria-label="Bloomie home">
          <BloomieMascot size={56} />
          <Wordmark />
        </Link>
        <div className="glass rounded-3xl p-5 sm:p-6">
          <h1 className="text-2xl font-extrabold text-center">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground text-center mt-1 mb-1">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="text-center text-sm mt-5">{footer}</div>}
      </main>
    </div>
  )
}

function PasswordInput(props: { label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <TextField label={props.label} type={show ? 'text' : 'password'} value={props.value} autoComplete={props.autoComplete}
        onChange={e => props.onChange(e.target.value)} error={props.error} hint={props.hint} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-[2.1rem] p-2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function GoogleButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (import.meta.env.VITE_ENABLE_GOOGLE_AUTH !== 'true') return null
  return (
    <>
      <div className="flex items-center gap-3 my-4 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <Button type="button" variant="outline" block loading={loading} onClick={async () => {
        setLoading(true); setError(null)
        const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo('/auth/callback') } })
        if (error) { setError(authErrorMessage(error)); setLoading(false) }
      }}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
        Continue with Google
      </Button>
      <FormError message={error} />
    </>
  )
}

// ─── Sign in ────────────────────────────────────────────────────────────────

export function SignInPage() {
  const nav = useNavigate()
  const location = useLocation()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  if (session) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
    setErrors({}); setFormError(null); setLoading(true)
    const { error } = await supabase!.auth.signInWithPassword(parsed.data)
    setLoading(false)
    if (error) { setFormError(authErrorMessage(error)); return }
    nav(from, { replace: true })
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Good to see you again 🌱"
      footer={<>New to Bloomie? <Link to="/signup" className="font-bold text-primary-strong underline-offset-2 hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} error={errors.email} />
        <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
        <div className="text-right -mt-2">
          <Link to="/forgot-password" className="text-sm font-semibold text-primary-strong hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" loading={loading}>Sign in</Button>
      </form>
      <GoogleButton />
    </AuthLayout>
  )
}

// ─── Sign up ────────────────────────────────────────────────────────────────

export function SignUpPage() {
  const { session } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  if (session) return <Navigate to="/app" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    const parsed = signUpSchema.safeParse({ displayName, email, password, acceptTerms })
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
    setErrors({}); setFormError(null); setLoading(true)
    const { data, error } = await supabase!.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: redirectTo('/auth/callback'),
        data: { display_name: parsed.data.displayName, timezone: browserTimezone() },
      },
    })
    setLoading(false)
    if (error) { setFormError(authErrorMessage(error)); return }
    // With email confirmation on, there is no session until the link is clicked.
    if (!data.session) setSentTo(parsed.data.email)
  }

  if (sentTo) return <CheckEmail email={sentTo} kind="verify" />

  return (
    <AuthLayout title="Create your account" subtitle="A calm space, just for you"
      footer={<>Already have an account? <Link to="/login" className="font-bold text-primary-strong hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <TextField label="Your name" autoComplete="given-name" value={displayName} onChange={e => setDisplayName(e.target.value)} error={errors.displayName} hint="Only used to greet you." />
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} error={errors.email} />
        <PasswordInput label="Password" autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} hint="At least 8 characters, with a letter and a number." />
        <div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} className="mt-0.5 size-5 accent-[var(--primary-strong)]" aria-invalid={!!errors.acceptTerms} />
            <span>I agree to the <Link to="/terms" target="_blank" className="font-semibold text-primary-strong underline">Terms</Link> and <Link to="/privacy" target="_blank" className="font-semibold text-primary-strong underline">Privacy Policy</Link>, and understand Bloomie is not a medical service.</span>
          </label>
          {errors.acceptTerms && <p role="alert" className="text-xs text-danger font-medium mt-1">{errors.acceptTerms}</p>}
        </div>
        <Button type="submit" block size="lg" loading={loading}>Create account</Button>
      </form>
      <GoogleButton />
    </AuthLayout>
  )
}

function CheckEmail({ email, kind }: { email: string; kind: 'verify' | 'reset' }) {
  const [resent, setResent] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <AuthLayout title="Check your email" footer={<Link to="/login" className="font-bold text-primary-strong hover:underline">Back to sign in</Link>}>
      <div className="flex flex-col items-center text-center gap-3" role="status">
        <MailCheck className="size-10 text-primary-strong" aria-hidden />
        <p className="text-sm">
          {kind === 'verify'
            ? <>We sent a verification link to <strong>{email}</strong>. Open it to activate your account.</>
            : <>If an account exists for <strong>{email}</strong>, you will receive a link to reset your password.</>}
        </p>
        <p className="text-xs text-muted-foreground">It can take a minute. Check your spam folder too.</p>
        {kind === 'verify' && (
          <Button variant="ghost" size="sm" loading={busy} disabled={resent} onClick={async () => {
            setBusy(true)
            await supabase!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo('/auth/callback') } })
            setBusy(false); setResent(true)
          }}>{resent ? 'Sent again ✓' : 'Resend email'}</Button>
        )}
      </div>
    </AuthLayout>
  )
}

// ─── Forgot / reset password ────────────────────────────────────────────────

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  if (sent) return <CheckEmail email={email} kind="reset" />

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a secure link"
      footer={<Link to="/login" className="font-bold text-primary-strong hover:underline">Back to sign in</Link>}>
      <form noValidate className="space-y-4" onSubmit={async e => {
        e.preventDefault()
        if (loading) return
        const parsed = emailSchema.safeParse(email)
        if (!parsed.success) { setError(parsed.error.issues[0].message); return }
        setError(undefined); setFormError(null); setLoading(true)
        const { error } = await supabase!.auth.resetPasswordForEmail(parsed.data, { redirectTo: redirectTo('/reset-password') })
        setLoading(false)
        // Do not reveal whether an account exists; only surface transport errors.
        if (error && (error.status === 429 || /fetch|network/i.test(error.message))) { setFormError(authErrorMessage(error)); return }
        setSent(true)
      }}>
        <FormError message={formError} />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} error={error} />
        <Button type="submit" block size="lg" loading={loading}>Send reset link</Button>
      </form>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const nav = useNavigate()
  const { session, loading: authLoading, clearRecovering } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!authLoading && !session) {
    return (
      <AuthLayout title="Link expired" footer={<Link to="/forgot-password" className="font-bold text-primary-strong hover:underline">Request a new link</Link>}>
        <p className="text-sm text-center">This password reset link is invalid or has expired. Please request a new one.</p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password">
      <form noValidate className="space-y-4" onSubmit={async e => {
        e.preventDefault()
        if (loading) return
        const parsed = resetPasswordSchema.safeParse({ password, confirm })
        if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
        setErrors({}); setFormError(null); setLoading(true)
        const { error } = await supabase!.auth.updateUser({ password: parsed.data.password })
        setLoading(false)
        if (error) { setFormError(authErrorMessage(error)); return }
        clearRecovering()
        nav('/app', { replace: true, state: { toast: 'Your password has been updated.' } })
      }}>
        <FormError message={formError} />
        <PasswordInput label="New password" autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} hint="At least 8 characters, with a letter and a number." />
        <PasswordInput label="Confirm password" autoComplete="new-password" value={confirm} onChange={setConfirm} error={errors.confirm} />
        <Button type="submit" block size="lg" loading={loading}>Update password</Button>
      </form>
    </AuthLayout>
  )
}

// ─── OAuth / email-link callback ────────────────────────────────────────────

export function AuthCallbackPage() {
  const nav = useNavigate()
  const { session, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const err = params.get('error_description') || hash.get('error_description')
    if (err) setError(err.replace(/\+/g, ' '))
  }, [])

  useEffect(() => {
    if (!loading && session) nav('/app', { replace: true })
  }, [loading, session, nav])

  useEffect(() => {
    const t = setTimeout(() => { if (!session) setError(e => e ?? 'This link is invalid or has expired.') }, 8000)
    return () => clearTimeout(t)
  }, [session])

  return (
    <AuthLayout title={error ? 'We could not sign you in' : 'Signing you in…'}
      footer={error ? <Link to="/login" className="font-bold text-primary-strong hover:underline">Back to sign in</Link> : undefined}>
      <p className="text-sm text-center" role="status">{error ?? 'One moment while we verify your link.'}</p>
    </AuthLayout>
  )
}
