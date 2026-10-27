// Pause-able session timer as a pure reducer. Elapsed time is derived from
// timestamps rather than counting ticks, so it stays accurate even when the
// browser throttles timers in background tabs.

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export interface TimerState {
  status: TimerStatus
  accumulatedMs: number
  runningSince: number | null
  durationMs: number
}

export type TimerAction =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'restart'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'finish'; now: number }
  | { type: 'reset'; durationMs?: number }

export const initialTimer = (durationMs: number): TimerState => ({
  status: 'idle', accumulatedMs: 0, runningSince: null, durationMs,
})

export function elapsedMs(s: TimerState, now: number): number {
  const live = s.status === 'running' && s.runningSince !== null ? now - s.runningSince : 0
  return Math.min(s.durationMs, s.accumulatedMs + live)
}

export function timerReducer(s: TimerState, a: TimerAction): TimerState {
  switch (a.type) {
    case 'start':
      return s.status === 'idle' ? { ...s, status: 'running', runningSince: a.now } : s
    case 'pause':
      return s.status === 'running' ? { ...s, status: 'paused', accumulatedMs: elapsedMs(s, a.now), runningSince: null } : s
    case 'resume':
      return s.status === 'paused' ? { ...s, status: 'running', runningSince: a.now } : s
    case 'restart':
      return { ...s, status: 'running', accumulatedMs: 0, runningSince: a.now }
    case 'tick':
      return s.status === 'running' && elapsedMs(s, a.now) >= s.durationMs
        ? { ...s, status: 'finished', accumulatedMs: s.durationMs, runningSince: null }
        : s
    case 'finish':
      return { ...s, status: 'finished', accumulatedMs: elapsedMs(s, a.now), runningSince: null }
    case 'reset':
      return initialTimer(a.durationMs ?? s.durationMs)
  }
}
