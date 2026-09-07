import { describe, expect, it, vi } from 'vitest'
import { Scheduler, type SchedulerClock } from './Scheduler'

class FakeClock implements SchedulerClock {
  private time = 0
  now(): number {
    return this.time
  }
  advance(seconds: number): void {
    this.time += seconds
  }
}

describe('Scheduler', () => {
  it('computes seconds-per-step from BPM (16th notes, 4 per beat)', () => {
    const clock = new FakeClock()
    const scheduler = new Scheduler(clock, vi.fn(), { bpm: 120 })
    // 120 BPM -> 0.5s per beat -> 0.125s per 16th-note step.
    expect(scheduler.secondsPerStep()).toBeCloseTo(0.125)
  })

  it('clamps BPM to the 40-240 range', () => {
    const clock = new FakeClock()
    const scheduler = new Scheduler(clock, vi.fn(), { bpm: 120 })
    scheduler.setBpm(9999)
    expect(scheduler.secondsPerStep()).toBeCloseTo(60 / 240 / 4)
    scheduler.setBpm(-10)
    expect(scheduler.secondsPerStep()).toBeCloseTo(60 / 40 / 4)
  })

  it('advances through steps and wraps at stepCount, scheduling against the clock rather than firing immediately', () => {
    const clock = new FakeClock()
    const onStep = vi.fn()
    const scheduler = new Scheduler(clock, onStep, {
      bpm: 120,
      stepCount: 4,
      scheduleAheadSeconds: 0.1,
    })

    scheduler.start()
    scheduler.tick() // nothing due yet beyond the first step within the lookahead window
    expect(onStep).toHaveBeenCalledWith(0, 0)

    onStep.mockClear()
    clock.advance(0.2) // ~1.6 steps worth of time at 0.125s/step
    scheduler.tick()
    expect(onStep.mock.calls.map((call) => call[0])).toEqual([1, 2])

    onStep.mockClear()
    clock.advance(0.5)
    scheduler.tick()
    // Should wrap back around to step 0 after passing step 3 (stepCount = 4).
    expect(onStep.mock.calls.map((call) => call[0])).toContain(0)
  })

  it('does not schedule anything after stop()', () => {
    const clock = new FakeClock()
    const onStep = vi.fn()
    const setIntervalFn = vi.fn().mockReturnValue(1 as unknown as ReturnType<typeof setInterval>)
    const clearIntervalFn = vi.fn()
    const scheduler = new Scheduler(clock, onStep, { setIntervalFn, clearIntervalFn })

    scheduler.start()
    expect(scheduler.isRunning).toBe(true)
    scheduler.stop()
    expect(scheduler.isRunning).toBe(false)
    expect(clearIntervalFn).toHaveBeenCalled()
  })
})
