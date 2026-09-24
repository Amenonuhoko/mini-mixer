import { describe, expect, it } from 'vitest'
import { createPad, DEFAULT_PERFORM } from '../state/defaults'
import type { PerformSettings } from '../state/types'
import { arpOrder, Performer, type PerformNote, type PerformVoice } from './performer'

const buffer = {} as AudioBuffer

function voice(padIndex: number, midis: number[]): PerformVoice {
  const pad = { ...createPad(padIndex), id: `pad${padIndex}` }
  return {
    pad,
    whole: { sampleId: `whole${padIndex}`, buffer, cents: 0 },
    midis,
    resolve: (midi): PerformNote => ({ sampleId: `n${midi}`, buffer, cents: 0 }),
  }
}

/** A performer on a fake clock: `advance` moves time and runs the lookahead poll. */
function rig(settings: Partial<PerformSettings>, anchor: number | null = null) {
  let now = 10
  let poll: (() => void) | null = null
  const played: Array<{ padId: string; sampleId: string; time: number; level: number }> = []
  const recorded: string[] = []
  const performer = new Performer(
    {
      now: () => now,
      beatAnchor: () => anchor,
      play: (pad, note, time, level) => {
        played.push({ padId: pad.id, sampleId: note.sampleId, time, level })
        return { stop: () => {} } as AudioBufferSourceNode
      },
    },
    {
      setIntervalFn: ((fn: () => void) => {
        poll = fn
        return 1
      }) as unknown as typeof setInterval,
      clearIntervalFn: (() => {
        poll = null
      }) as unknown as typeof clearInterval,
      random: () => 0,
    },
  )
  performer.configure({ ...DEFAULT_PERFORM, ...settings }, 120)
  performer.setListener((_padId, sampleId) => recorded.push(sampleId))
  const advance = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.02) {
      now += 0.02
      poll?.()
    }
  }
  return { performer, played, recorded, advance, running: () => poll !== null }
}

describe('arpOrder', () => {
  it('walks up, down, and up-down without repeating the turnaround notes', () => {
    expect(arpOrder([64, 60, 67], 'up', 1)).toEqual([60, 64, 67])
    expect(arpOrder([60, 64, 67], 'down', 1)).toEqual([67, 64, 60])
    expect(arpOrder([60, 64, 67], 'upDown', 1)).toEqual([60, 64, 67, 64])
    expect(arpOrder([60, 64], 'up', 2)).toEqual([60, 64, 72, 76])
  })
})

describe('Performer', () => {
  it('note repeat hits on the press, then every sixteenth while held', () => {
    const { performer, played, advance, running } = rig({ mode: 'repeat', rate: '1/16' })
    performer.press('a', voice(0, []), true)
    expect(played).toHaveLength(1)
    expect(played[0]!.time).toBe(10)
    advance(0.5) // a sixteenth at 120 BPM is 0.125 s
    const times = played.map((hit) => +(hit.time - 10).toFixed(3))
    expect(times.slice(0, 5)).toEqual([0, 0.125, 0.25, 0.375, 0.5])
    performer.release('a')
    expect(running()).toBe(false)
  })

  it('snaps repeats to the beat grid while something is playing', () => {
    // Beat anchor at 9.9: the grid runs 9.9, 10.025, 10.15 … — 10.025 is too close to the press's own hit, so 10.15 comes next.
    const { performer, played, advance } = rig({ mode: 'repeat', rate: '1/16' }, 9.9)
    performer.press('a', voice(0, []), true)
    advance(0.3)
    expect(played.map((hit) => +hit.time.toFixed(3)).slice(0, 3)).toEqual([10, 10.15, 10.275])
  })

  it('arpeggiates a chord pad up through its notes and the octave above', () => {
    const { performer, played, advance } = rig({ mode: 'arp', rate: '1/16', arpPattern: 'up', arpOctaves: 2 })
    performer.press('a', voice(0, [60, 64, 67]), true)
    advance(0.7)
    expect(played.slice(0, 7).map((hit) => hit.sampleId)).toEqual(['n60', 'n64', 'n67', 'n72', 'n76', 'n79', 'n60'])
  })

  it('arpeggiates across several held note pads together', () => {
    const { performer, played, advance } = rig({ mode: 'arp', rate: '1/8' })
    performer.press('a', voice(0, [67]), true)
    advance(0.1)
    performer.press('b', voice(1, [60]), true)
    advance(0.6)
    expect(played.map((hit) => hit.padId)).toContain('pad1')
    expect(new Set(played.slice(1).map((hit) => hit.sampleId))).toEqual(new Set(['n60', 'n67']))
  })

  it('latch keeps going after release until a fresh press replaces the set', () => {
    const { performer, played, advance, running } = rig({ mode: 'arp', latch: true })
    performer.press('a', voice(0, [60, 64]), true)
    performer.release('a')
    advance(0.3)
    expect(running()).toBe(true)
    performer.press('b', voice(1, [70]), true)
    const before = played.length
    advance(0.3)
    expect(played.slice(before).every((hit) => hit.sampleId === 'n70')).toBe(true)
    performer.configure({ ...DEFAULT_PERFORM, mode: 'arp', latch: false }, 120)
    performer.release('b')
    expect(running()).toBe(false)
  })

  it('strums a chord pad low to high, each note quieter, and records the whole chord', () => {
    const { performer, played, recorded } = rig({ mode: 'off', strum: 'up', strumSpeed: 'medium' })
    performer.press('a', voice(0, [67, 60, 64]), false)
    expect(played.map((hit) => hit.sampleId)).toEqual(['n60', 'n64', 'n67'])
    expect(played.map((hit) => +(hit.time - 10).toFixed(3))).toEqual([0, 0.035, 0.07])
    expect(played[0]!.level).toBeCloseTo(1 / Math.sqrt(3))
    expect(recorded).toEqual(['whole0'])
  })

  it('knows when a press needs it at all', () => {
    expect(Performer.handles(DEFAULT_PERFORM, { midis: [60, 64, 67] })).toBe(false)
    expect(Performer.handles({ ...DEFAULT_PERFORM, strum: 'up' }, { midis: [60, 64, 67] })).toBe(true)
    expect(Performer.handles({ ...DEFAULT_PERFORM, strum: 'up' }, { midis: [60] })).toBe(false)
    expect(Performer.handles({ ...DEFAULT_PERFORM, mode: 'repeat' }, { midis: [] })).toBe(true)
  })
})
