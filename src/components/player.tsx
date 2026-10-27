import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { breathAt, PHASE_LABEL } from '../lib/breathing'
import { elapsedMs, initialTimer, timerReducer } from '../lib/timer'
import type { BreathingPattern } from '../lib/types'

// ─── Timer hook ─────────────────────────────────────────────────────────────

export function useSessionTimer(durationSeconds: number, resetKey: unknown = null) {
  const [state, dispatch] = useReducer(timerReducer, durationSeconds * 1000, initialTimer)
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => { dispatch({ type: 'reset', durationMs: durationSeconds * 1000 }) }, [durationSeconds, resetKey])

  useEffect(() => {
    if (state.status !== 'running') return
    const id = window.setInterval(() => {
      const t = performance.now()
      setNow(t)
      dispatch({ type: 'tick', now: t })
    }, 250)
    return () => window.clearInterval(id)
  }, [state.status])

  const elapsed = elapsedMs(state, now) / 1000
  const act = useCallback((type: 'start' | 'pause' | 'resume' | 'restart' | 'finish') => {
    const t = performance.now()
    setNow(t)
    dispatch({ type, now: t })
  }, [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])
  return { status: state.status, elapsed, remaining: Math.max(0, durationSeconds - elapsed), progress: durationSeconds ? elapsed / durationSeconds : 0, act, reset }
}

// ─── Reduced motion ─────────────────────────────────────────────────────────

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const fn = () => setReduced(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return reduced
}

// ─── Breathing guide ────────────────────────────────────────────────────────

export function BreathingCircle({ pattern, elapsed, active, size = 220 }: { pattern: BreathingPattern; elapsed: number; active: boolean; size?: number }) {
  const reduced = usePrefersReducedMotion()
  const b = breathAt(pattern, elapsed)
  const scale = reduced ? 1 : 0.55 + 0.45 * b.scale
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <div className="absolute inset-0 rounded-full bg-secondary/40" />
        <div className="absolute rounded-full transition-transform ease-linear"
          style={{ inset: 0, transform: `scale(${active ? scale : 0.6})`, transitionDuration: reduced ? '0ms' : '260ms',
            background: 'radial-gradient(circle at 35% 30%, #c8e6df, #5b9fac 70%)', boxShadow: '0 10px 40px rgba(91,159,172,0.35)' }} />
        <div className="relative text-center text-white drop-shadow">
          <p className="font-display text-xl font-extrabold" aria-live="polite">{active ? PHASE_LABEL[b.phase] : 'Ready'}</p>
          {active && <p className="text-3xl font-black tabular-nums" aria-hidden>{b.remaining}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        In {pattern.inhale}{pattern.hold ? ` · hold ${pattern.hold}` : ''} · out {pattern.exhale}{pattern.hold_after ? ` · hold ${pattern.hold_after}` : ''}
      </p>
    </div>
  )
}

// ─── Generated ambient sound (no third-party audio) ─────────────────────────

export type AmbientKind = 'off' | 'soft-noise' | 'warm-tone'

export function useAmbientSound(kind: AmbientKind, playing: boolean, volume = 0.18) {
  const ctxRef = useRef<AudioContext | null>(null)
  const nodesRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    const stop = () => { nodesRef.current?.stop(); nodesRef.current = null }
    if (kind === 'off' || !playing) { stop(); return }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = ctxRef.current ?? new AC()
    ctxRef.current = ctx
    void ctx.resume()
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2)
    gain.connect(ctx.destination)
    const sources: AudioScheduledSourceNode[] = []

    if (kind === 'soft-noise') {
      // Brown noise: integrated white noise, low-passed — a soft, rain-like hush.
      const len = ctx.sampleRate * 4
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5 }
      const src = ctx.createBufferSource()
      src.buffer = buf; src.loop = true
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
      src.connect(lp).connect(gain); src.start(); sources.push(src)
    } else {
      // Warm drone: two gently detuned sine tones with slow tremolo.
      for (const f of [174, 261.6]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f
        const g = ctx.createGain(); g.gain.value = 0.35
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.15
        lfo.connect(lfoGain).connect(g.gain)
        o.connect(g).connect(gain); o.start(); lfo.start(); sources.push(o, lfo)
      }
    }
    nodesRef.current = {
      stop: () => {
        const t = ctx.currentTime
        gain.gain.cancelScheduledValues(t)
        gain.gain.setValueAtTime(gain.gain.value, t)
        gain.gain.linearRampToValueAtTime(0, t + 0.6)
        setTimeout(() => { sources.forEach(s => { try { s.stop() } catch { /* already stopped */ } }); gain.disconnect() }, 700)
      },
    }
    return stop
  }, [kind, playing, volume])

  useEffect(() => () => { nodesRef.current?.stop(); void ctxRef.current?.close() }, [])
}

// ─── Spoken guidance via the device's speech synthesis ──────────────────────

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function speak(text: string) {
  if (!speechSupported()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.88; u.pitch = 1; u.volume = 0.9
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}

/** Lock-screen / headset controls where the browser supports the Media Session API. */
export function useMediaSession(title: string, handlers: { play: () => void; pause: () => void }) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Bloomie', artwork: [{ src: '/favicon.svg', sizes: '72x72', type: 'image/svg+xml' }] })
    navigator.mediaSession.setActionHandler('play', handlers.play)
    navigator.mediaSession.setActionHandler('pause', handlers.pause)
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
    }
  }, [title, handlers.play, handlers.pause])
}
