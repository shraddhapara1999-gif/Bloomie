import type { BreathingPattern } from './types'

export type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'hold_after'

export const PHASE_LABEL: Record<BreathPhase, string> = {
  inhale: 'Breathe in', hold: 'Hold', exhale: 'Breathe out', hold_after: 'Rest',
}

export const DEFAULT_PATTERN: BreathingPattern = { inhale: 4, hold: 0, exhale: 6, hold_after: 0 }

export interface BreathState {
  phase: BreathPhase
  /** 0..1 progress through the current phase */
  progress: number
  /** Seconds remaining in the current phase (rounded up) */
  remaining: number
  /** 0..1 visual size of the breathing circle */
  scale: number
  cycle: number
}

export function cycleLength(p: BreathingPattern): number {
  return p.inhale + p.hold + p.exhale + p.hold_after
}

export function breathAt(p: BreathingPattern, elapsedSeconds: number): BreathState {
  const total = cycleLength(p)
  if (total <= 0) return { phase: 'inhale', progress: 0, remaining: 0, scale: 0.5, cycle: 0 }
  const cycle = Math.floor(elapsedSeconds / total)
  let t = elapsedSeconds - cycle * total
  const phases: [BreathPhase, number][] = [['inhale', p.inhale], ['hold', p.hold], ['exhale', p.exhale], ['hold_after', p.hold_after]]
  for (const [phase, len] of phases) {
    if (len <= 0) continue
    if (t < len) {
      const progress = t / len
      const scale = phase === 'inhale' ? progress : phase === 'hold' ? 1 : phase === 'exhale' ? 1 - progress : 0
      return { phase, progress, remaining: Math.ceil(len - t), scale, cycle }
    }
    t -= len
  }
  return { phase: 'inhale', progress: 0, remaining: p.inhale, scale: 0, cycle: cycle + 1 }
}
