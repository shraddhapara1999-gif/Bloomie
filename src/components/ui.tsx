import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router'
import clsx from 'clsx'
import { Loader2, X } from 'lucide-react'
import { BloomieMascot } from './brand'

// ─── Buttons ────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'text-white shadow-[0_4px_16px_rgba(59,122,135,0.35)] hover:brightness-105 active:brightness-95',
  soft: 'bg-muted text-foreground hover:bg-[#dcebe6]',
  ghost: 'bg-transparent text-primary-strong hover:bg-muted',
  outline: 'bg-white/70 text-primary-strong border-2 border-border hover:border-primary',
  danger: 'bg-danger text-white hover:brightness-110',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  block?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, block, className, children, disabled, style, ...rest }: ButtonProps) {
  const sizes = { sm: 'px-3 py-2 text-xs rounded-xl', md: 'px-4 py-3 text-sm rounded-2xl', lg: 'px-5 py-3.5 text-base rounded-2xl' }
  const isDisabled = disabled || loading
  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-bold transition-all select-none min-h-11',
        sizes[size], variants[variant], block && 'w-full',
        isDisabled && 'opacity-60 cursor-not-allowed shadow-none', className,
      )}
      style={variant === 'primary' && (!isDisabled || loading) ? { background: 'var(--cta-gradient)', ...style } :
        variant === 'primary' ? { background: '#8fa9a3', ...style } : style}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function ButtonLink({ to, variant = 'primary', className, children, block }: { to: string; variant?: Variant; className?: string; children: ReactNode; block?: boolean }) {
  return (
    <Link
      to={to}
      className={clsx('inline-flex items-center justify-center gap-2 font-bold transition-all px-4 py-3 text-sm rounded-2xl min-h-11', variants[variant], block && 'w-full', className)}
      style={variant === 'primary' ? { background: 'var(--cta-gradient)' } : undefined}
    >
      {children}
    </Link>
  )
}

// ─── Surfaces ───────────────────────────────────────────────────────────────

export function Card({ className, children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'li' } & Record<string, unknown>) {
  return (
    <As {...rest} className={clsx('rounded-2xl bg-card p-4 sm:p-5 shadow-[var(--shadow-card)]', className)}>
      {children}
    </As>
  )
}

export function GlassPanel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('glass rounded-3xl p-5', className)}>{children}</div>
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 id={id} className="font-bold text-base sm:text-lg">{children}</h2>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, action, back }: { title: string; subtitle?: string; action?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-5 animate-fade-up">
      {back}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

// ─── Form fields ────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-xl px-3.5 py-3 text-base sm:text-sm bg-muted text-foreground border-2 border-border outline-none transition focus:border-primary-strong focus:bg-white placeholder:text-muted-foreground/80 aria-[invalid=true]:border-danger'

interface FieldProps { label: ReactNode; error?: string; hint?: ReactNode; optional?: boolean; className?: string }

export function TextField({ label, error, hint, optional, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      <input id={id} {...rest} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={inputCls} />
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground mt-1">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-xs text-danger font-medium mt-1">{error}</p>}
    </div>
  )
}

export function TextAreaField({ label, error, hint, optional, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      <textarea id={id} {...rest} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={clsx(inputCls, 'resize-y leading-relaxed')} />
      {hint && !error && <div id={`${id}-hint`} className="text-xs text-muted-foreground mt-1">{hint}</div>}
      {error && <p id={`${id}-err`} role="alert" className="text-xs text-danger font-medium mt-1">{error}</p>}
    </div>
  )
}

export function SelectField({ label, error, className, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">{label}</label>
      <select id={id} {...rest} aria-invalid={!!error} className={inputCls}>{children}</select>
      {error && <p role="alert" className="text-xs text-danger font-medium mt-1">{error}</p>}
    </div>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return <div role="alert" className="rounded-xl bg-[#fbe9e6] text-[#7a2a20] px-3.5 py-3 text-sm font-medium">{message}</div>
}

// ─── Chips & toggles ────────────────────────────────────────────────────────

export function Chip({ selected, onClick, children, className, ...rest }: { selected?: boolean; onClick?: () => void; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      {...rest}
      className={clsx(
        'px-3.5 py-2 rounded-full text-sm font-semibold transition-all border-[1.5px] min-h-10 shrink-0 whitespace-nowrap',
        selected ? 'bg-primary-strong text-white border-primary-strong' : 'bg-muted text-foreground border-border hover:border-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative shrink-0 w-12 h-7 rounded-full transition-colors', checked ? 'bg-primary-strong' : 'bg-[#b9d3cc]', disabled && 'opacity-50')}
      >
        <span className={clsx('absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-2xl bg-muted p-1 gap-1">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all min-h-9', value === o.value ? 'bg-white text-primary-strong shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Feedback states ────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-xl', className)} aria-hidden="true" />
}

export function LoadingBlock({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-20" />)}
    </div>
  )
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-8 px-4">
      {icon ?? <BloomieMascot size={56} />}
      <h3 className="font-bold text-base mt-1">{title}</h3>
      {body && <p className="text-sm text-muted-foreground max-w-sm">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div role="alert" className="rounded-2xl bg-[#fbe9e6] text-[#7a2a20] p-4 text-sm flex items-center justify-between gap-3 flex-wrap">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={e => { e.preventDefault(); onClose() }}
      onClick={e => { if (e.target === ref.current) onClose() }}
      className={clsx('m-auto w-[calc(100%-2rem)] rounded-3xl bg-card p-0 text-foreground shadow-2xl backdrop:bg-[#1e3a35]/40 backdrop:backdrop-blur-sm', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 id={titleId} className="text-xl font-extrabold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X className="size-5" /></button>
          </div>
          <div className="text-sm">{children}</div>
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 rounded-full bg-border overflow-hidden">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #5b9fac, #6aad6e)' }} />
    </div>
  )
}
