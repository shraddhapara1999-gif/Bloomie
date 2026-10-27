import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const signInWithPassword = vi.fn()
const signUp = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a), signUp: (...a: unknown[]) => signUp(...a) } },
  db: () => { throw new Error('not used') },
  check: (r: { data: unknown }) => r.data,
}))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false, profile: null, timezone: 'UTC', clearRecovering: () => {} }),
}))
vi.mock('../lib/env', () => ({ configStatus: { ok: false, missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'], config: null } }))

const { SignInPage, SignUpPage } = await import('./auth/AuthPages')
const { SetupRequiredPage } = await import('./PublicPages')
const { HelpContent } = await import('../components/Safety')

function wrap(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

describe('sign in form', () => {
  it('shows inline validation and does not call the server for invalid input', async () => {
    wrap(<SignInPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Please enter your email')).toBeInTheDocument()
    expect(screen.getByText('Please enter your password')).toBeInTheDocument()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('shows a friendly message for wrong credentials', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials', status: 400 } })
    wrap(<SignInPage />)
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co')
    await userEvent.type(screen.getByLabelText('Password'), 'whatever1')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password do not match')
  })
})

describe('sign up form', () => {
  it('requires accepting the terms and a strong password', async () => {
    wrap(<SignUpPage />)
    await userEvent.type(screen.getByLabelText('Your name'), 'Asha')
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText(/accept the terms/)).toBeInTheDocument()
    expect(signUp).not.toHaveBeenCalled()
  })

  it('shows the check-your-email screen when verification is required', async () => {
    signUp.mockResolvedValueOnce({ data: { session: null, user: { id: 'u' } }, error: null })
    wrap(<SignUpPage />)
    await userEvent.type(screen.getByLabelText('Your name'), 'Asha')
    await userEvent.type(screen.getByLabelText('Email'), 'asha@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'bloomtest123')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(signUp.mock.calls[0][0].options.data.display_name).toBe('Asha')
  })
})

describe('missing configuration', () => {
  it('explains what to set instead of failing silently', () => {
    wrap(<SetupRequiredPage />)
    expect(screen.getByText('Almost there')).toBeInTheDocument()
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
  })
})

describe('help & crisis support', () => {
  it('lists callable India helplines including emergency services', () => {
    wrap(<HelpContent />)
    expect(screen.getByRole('link', { name: /Call Emergency services at 112/ })).toHaveAttribute('href', 'tel:112')
    expect(screen.getByRole('link', { name: /Tele-MANAS/ })).toHaveAttribute('href', 'tel:14416')
  })
})
