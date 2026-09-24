import { BPM_MAX, BPM_MIN, STEP_COUNT } from '../state/constants'

/**
 * Anything that can report "now" in the same units as AudioContext.currentTime
 * (seconds, monotonically increasing). Injectable so the scheduler is testable
 * without a real AudioContext.
 */
/** How late a step may be and still play; later ones are skipped rather than burst out together. */
const LATE_TOLERANCE_SECONDS = 0.1

export interface SchedulerClock {
  now(): number
}

export type StepCallback = (stepIndex: number, time: number) => void

interface SchedulerOptions {
  bpm?: number
  stepCount?: number
  /** How far ahead of "now" to schedule steps, in seconds. */
  scheduleAheadSeconds?: number
  /** How often the lookahead loop polls, in milliseconds. */
  lookaheadIntervalMs?: number
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
}

/**
 * Drives the step sequencer using the standard "lookahead" pattern: a timer polls
 * frequently, but the actual step times are computed against the audio clock and
 * handed to the callback ahead of when they're due — not fired synchronously from
 * the timer tick. This is what keeps timing stable against main-thread jitter,
 * unlike firing audio directly from a setInterval callback.
 *
 * See: https://web.dev/articles/audio-scheduling ("A Tale of Two Clocks").
 */
export class Scheduler {
  private readonly clock: SchedulerClock
  private readonly onStep: StepCallback
  private stepCount: number
  private rangeStart = 0
  private rangeEnd: number
  private readonly scheduleAheadSeconds: number
  private readonly lookaheadIntervalMs: number
  private readonly setIntervalFn: typeof setInterval
  private readonly clearIntervalFn: typeof clearInterval

  private bpm: number
  private nextStepTime = 0
  private currentStep = 0
  private timerId: ReturnType<typeof setInterval> | null = null

  constructor(clock: SchedulerClock, onStep: StepCallback, options: SchedulerOptions = {}) {
    this.clock = clock
    this.onStep = onStep
    this.bpm = clamp(options.bpm ?? 120, BPM_MIN, BPM_MAX)
    this.stepCount = options.stepCount ?? STEP_COUNT
    this.rangeEnd = this.stepCount
    this.scheduleAheadSeconds = options.scheduleAheadSeconds ?? 0.1
    this.lookaheadIntervalMs = options.lookaheadIntervalMs ?? 25
    // Bound to globalThis: calling the bare functions as `this.setIntervalFn(...)`
    // invokes them with the Scheduler instance as `this`, which real browsers reject
    // ("Illegal invocation") since setInterval/clearInterval are branded Window
    // methods — Node/jsdom don't enforce that, so this only surfaces in a real browser.
    this.setIntervalFn = options.setIntervalFn ?? setInterval.bind(globalThis)
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval.bind(globalThis)
  }

  get isRunning(): boolean {
    return this.timerId !== null
  }

  /** Seconds per 16th-note step at the current BPM (4 steps per quarter note). */
  secondsPerStep(): number {
    return 60 / this.bpm / 4
  }

  setBpm(bpm: number): void {
    this.bpm = clamp(bpm, BPM_MIN, BPM_MAX)
  }

  setStepCount(stepCount: number): void {
    this.stepCount = Math.max(1, Math.floor(stepCount))
    this.setRange(0, this.stepCount)
  }

  /** Limits playback to a section of the current timeline. End is exclusive. */
  setRange(start: number, end: number): void {
    this.rangeStart = Math.max(0, Math.floor(start))
    this.rangeEnd = Math.max(this.rangeStart + 1, Math.floor(end))
    if (this.currentStep < this.rangeStart || this.currentStep >= this.rangeEnd) {
      this.currentStep = this.rangeStart
    }
  }

  start(): void {
    if (this.isRunning) return
    this.currentStep = this.rangeStart
    this.nextStepTime = this.clock.now()
    this.timerId = this.setIntervalFn(this.tick, this.lookaheadIntervalMs)
  }

  stop(): void {
    if (this.timerId !== null) {
      this.clearIntervalFn(this.timerId)
      this.timerId = null
    }
  }

  /** Exposed for tests that want to drive scheduling without relying on a real timer. */
  tick = (): void => {
    const now = this.clock.now()
    // After a stall (a busy main thread, a backgrounded tab), steps whose time
    // has long passed would all fire at once — a burst. Skip them instead and
    // rejoin the grid, keeping the step count in place, as a drum machine
    // would.
    if (this.nextStepTime < now - LATE_TOLERANCE_SECONDS) {
      const missed = Math.ceil((now - this.nextStepTime) / this.secondsPerStep())
      this.nextStepTime += missed * this.secondsPerStep()
      this.currentStep = this.rangeStart + (this.currentStep - this.rangeStart + missed) % (this.rangeEnd - this.rangeStart)
    }
    const horizon = now + this.scheduleAheadSeconds
    while (this.nextStepTime < horizon) {
      this.onStep(this.currentStep, this.nextStepTime)
      this.nextStepTime += this.secondsPerStep()
      this.currentStep = this.currentStep + 1 < this.rangeEnd ? this.currentStep + 1 : this.rangeStart
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
