// Brand illustrations from the Figma Make design (Bloomie mascot + florals).

export function BloomieMascot({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="36" cy="44" rx="22" ry="20" fill="#c5e0c6" />
      <ellipse cx="26" cy="48" rx="5" ry="3.5" fill="#f4a7a0" opacity="0.6" />
      <ellipse cx="46" cy="48" rx="5" ry="3.5" fill="#f4a7a0" opacity="0.6" />
      <ellipse cx="30" cy="42" rx="2.5" ry="3" fill="#2c4a44" />
      <ellipse cx="42" cy="42" rx="2.5" ry="3" fill="#2c4a44" />
      <circle cx="31" cy="41" r="1" fill="white" />
      <circle cx="43" cy="41" r="1" fill="white" />
      <path d="M30 50 Q36 55 42 50" stroke="#2c4a44" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M36 24 Q36 18 36 14" stroke="#5b8a5e" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="30" cy="17" rx="7" ry="4" fill="#6aad6e" transform="rotate(-30 30 17)" />
      <ellipse cx="42" cy="15" rx="7" ry="4" fill="#82c986" transform="rotate(30 42 15)" />
      <ellipse cx="36" cy="10" rx="5" ry="3.5" fill="#6aad6e" transform="rotate(-10 36 10)" />
    </svg>
  )
}

export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-xl' : 'text-3xl'
  return (
    <span className={`${cls} font-black font-display text-primary-strong`} style={{ letterSpacing: '-0.5px' }}>
      Bloomie
    </span>
  )
}

export function FloralBg() {
  const petals = [0, 60, 120, 180, 240, 300]
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      <svg className="absolute -top-8 -left-8 opacity-40" width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="22" fill="#6aad6e" />
        {petals.map(a => {
          const x = 70 + 36 * Math.cos((a * Math.PI) / 180)
          const y = 70 + 36 * Math.sin((a * Math.PI) / 180)
          return <ellipse key={a} cx={x} cy={y} rx="16" ry="28" fill="#f4a57e" opacity="0.7" transform={`rotate(${a},${x},${y})`} />
        })}
      </svg>
      <svg className="absolute -bottom-4 -left-4 opacity-40" width="120" height="160" viewBox="0 0 120 160">
        <rect x="55" y="60" width="10" height="80" rx="5" fill="#6aad6e" />
        <ellipse cx="60" cy="50" rx="25" ry="40" fill="#e8a090" opacity="0.8" />
        <ellipse cx="40" cy="70" rx="20" ry="35" fill="#e8a090" opacity="0.6" transform="rotate(-20 40 70)" />
        <ellipse cx="80" cy="70" rx="20" ry="35" fill="#e8a090" opacity="0.6" transform="rotate(20 80 70)" />
      </svg>
      <svg className="absolute -bottom-4 -right-4 opacity-40" width="120" height="160" viewBox="0 0 120 160">
        <rect x="55" y="60" width="10" height="80" rx="5" fill="#6aad6e" />
        <ellipse cx="60" cy="50" rx="25" ry="40" fill="#c8a8d8" opacity="0.8" />
        <ellipse cx="40" cy="70" rx="20" ry="35" fill="#c8a8d8" opacity="0.6" transform="rotate(-20 40 70)" />
        <ellipse cx="80" cy="70" rx="20" ry="35" fill="#c8a8d8" opacity="0.6" transform="rotate(20 80 70)" />
      </svg>
      <div className="absolute top-8 right-8 w-4 h-4 rounded-full opacity-30 bg-leaf" />
      <div className="absolute top-16 right-16 w-2.5 h-2.5 rounded-full opacity-20 bg-primary" />
    </div>
  )
}
