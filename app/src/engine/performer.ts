import type { AppState, ArpPattern, Bank, Pad, PerformRate, PerformSettings, StrumSpeed } from '../state/types'

/** One playable sound: a sample, nudged by `cents` when the exact pitch wasn't rendered. */
export interface PerformNote {
  sampleId: string
  buffer: AudioBuffer
  cents: number
}

/** A pressed pad, ready to perform: its own sound, what it plays, and a way to reach any single note of its bank. */
export interface PerformVoice {
  pad: Pad
  /** The pad's own sample — the mixed chord for a chord pad. */
  whole: PerformNote
  /** The notes it plays; empty for a drum or sample pad. */
  midis: number[]
  /** A single note from the bank's note pool (nearest rendered note, pitched to fit), or null if there is no pool. */
  resolve: (midi: number) => PerformNote | null
}

export interface PerformHost {
  now(): number
  /** Audio time of a beat boundary while something is playing (so repeats land on the grid), else null. */
  beatAnchor(): number | null
  play(pad: Pad, note: PerformNote, time: number, level: number): AudioBufferSourceNode
}

/** Fired for every performed hit, as the sample a step-recording should write into that pad's row, at its audio time. */
export type PerformHitListener = (padId: string, sampleId: string, time: number) => void

/** Note lengths in beats. */
export const RATE_BEATS: Record<PerformRate, number> = {
  '1/4': 1,
  '1/8': 1 / 2,
  '1/8T': 1 / 3,
  '1/16': 1 / 4,
  '1/16T': 1 / 6,
  '1/32': 1 / 8,
}

/** Gap between a strum's notes. */
export const STRUM_SECONDS: Record<StrumSpeed, number> = { fast: 0.015, medium: 0.035, slow: 0.07 }

/** Short label for the header button: what holding a pad currently does. */
export function performSummary(perform: PerformSettings): string | null {
  if (perform.mode === 'repeat') return `Rpt ${perform.rate}`
  if (perform.mode === 'arp') return `Arp ${perform.rate}`
  if (perform.strum !== 'off') return 'Strum'
  return null
}

/** The order an arpeggio walks a set of notes. 'random' walks the 'up' set in random order at play time. */
export function arpOrder(midis: readonly number[], pattern: ArpPattern, octaves: 1 | 2): number[] {
  const base = [...new Set(midis)].sort((a, b) => a - b)
  const up = Array.from({ length: octaves }, (_, octave) => base.map((midi) => midi + 12 * octave)).flat()
  switch (pattern) {
    case 'down':
      return [...up].reverse()
    case 'upDown':
      // Turn around without repeating the top or bottom note.
      return up.length > 2 ? [...up, ...up.slice(1, -1).reverse()] : up
    default:
      return up
  }
}

/** Builds the voice for a pad, or null if the pad has no sound. */
export function performVoice(state: Pick<AppState, 'samples'>, bank: Bank, pad: Pad): PerformVoice | null {
  const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined
  if (!sample) return null
  const pool = Object.entries(bank.noteSampleIds).flatMap(([midi, sampleId]) => {
    const note = state.samples[sampleId]
    return note ? [{ midi: Number(midi), note }] : []
  })
  return {
    pad,
    whole: { sampleId: sample.id, buffer: sample.buffer, cents: 0 },
    midis: pad.music?.midis ?? [],
    resolve: (midi) => {
      if (pool.length === 0) return null
      const nearest = pool.reduce((best, entry) => (Math.abs(entry.midi - midi) < Math.abs(best.midi - midi) ? entry : best))
      return { sampleId: nearest.note.id, buffer: nearest.note.buffer, cents: (midi - nearest.midi) * 100 }
    },
  }
}

interface PerformerOptions {
  lookaheadSeconds?: number
  pollMs?: number
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
  random?: () => number
}

/**
 * What a held pad does beyond one hit: note repeat, arpeggio, strum.
 *
 * Runs its own lookahead loop against the audio clock (the same pattern as
 * the sequencer's Scheduler), so repeats and arpeggio notes are sample-
 * accurate, and snaps them to the beat grid whenever something is playing.
 * The first note always sounds on the press itself — a performance must
 * feel immediate. Repeat retriggers every held pad; the arpeggiator walks
 * the notes of every held pad (a chord pad's own notes, or several held
 * note pads together), climbing octaves through the bank's note pool.
 * Latch keeps it going after release until the next fresh press. Strum
 * rolls a chord pad's notes instead of hitting the mixed chord, on a plain
 * hit or on every repeat.
 */
export class Performer {
  private readonly host: PerformHost
  private readonly lookaheadSeconds: number
  private readonly pollMs: number
  private readonly setIntervalFn: typeof setInterval
  private readonly clearIntervalFn: typeof clearInterval
  private readonly random: () => number
  private settings: PerformSettings | null = null
  private bpm = 120
  private readonly held = new Map<string, PerformVoice>()
  private latched: PerformVoice[] = []
  private readonly gated = new Map<string, AudioBufferSourceNode[]>()
  private timerId: ReturnType<typeof setInterval> | null = null
  private nextTime = 0
  private step = 0
  private listener: PerformHitListener | null = null

  constructor(host: PerformHost, options: PerformerOptions = {}) {
    this.host = host
    this.lookaheadSeconds = options.lookaheadSeconds ?? 0.1
    this.pollMs = options.pollMs ?? 25
    this.setIntervalFn = options.setIntervalFn ?? setInterval.bind(globalThis)
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval.bind(globalThis)
    this.random = options.random ?? Math.random
  }

  get isRunning(): boolean {
    return this.timerId !== null
  }

  configure(settings: PerformSettings, bpm: number): void {
    const previous = this.settings
    this.settings = settings
    this.bpm = bpm
    if (settings.mode === 'off' || (previous?.latch && !settings.latch)) {
      this.latched = []
      if (settings.mode === 'off' || this.activeVoices().length === 0) this.stopRunner()
    }
  }

  setListener(listener: PerformHitListener | null): void {
    this.listener = listener
  }

  /** Whether a press needs the performer at all, rather than the plain one-shot path. */
  static handles(settings: PerformSettings, voice: Pick<PerformVoice, 'midis'>): boolean {
    return settings.mode !== 'off' || (settings.strum !== 'off' && voice.midis.length > 1)
  }

  /** A pad went down. `key` identifies the finger/pointer; `gate` stops a plain hit's sound on release. */
  press(key: string, voice: PerformVoice, gate: boolean): void {
    const settings = this.settings
    if (!settings) return
    const now = this.host.now()
    if (settings.mode === 'off') {
      const sources = this.hit(voice, now)
      if (gate) this.gated.set(key, sources)
      return
    }
    // Latch: a fresh press (nothing physically held) starts a new set.
    if (settings.latch && this.held.size === 0) this.latched = []
    this.held.set(key, voice)
    if (settings.latch) this.latched.push(voice)
    if (!this.isRunning) this.start(now)
  }

  release(key: string): void {
    for (const source of this.gated.get(key) ?? []) stopSafely(source)
    this.gated.delete(key)
    if (!this.held.delete(key)) return
    if (this.activeVoices().length === 0) this.stopRunner()
  }

  stopAll(): void {
    for (const key of [...this.gated.keys()]) this.release(key)
    this.held.clear()
    this.latched = []
    this.stopRunner()
  }

  private activeVoices(): PerformVoice[] {
    return this.settings?.latch ? this.latched : [...this.held.values()]
  }

  private intervalSeconds(): number {
    return (60 / this.bpm) * RATE_BEATS[this.settings?.rate ?? '1/16']
  }

  private start(now: number): void {
    this.step = 0
    this.tick(now)
    const interval = this.intervalSeconds()
    const anchor = this.host.beatAnchor()
    let next = now + interval
    if (anchor !== null) {
      next = anchor + Math.ceil((now - anchor) / interval + 1e-6) * interval
      // Too close to the press's own note — skip to the following grid line.
      if (next - now < interval / 2) next += interval
    }
    this.nextTime = next
    this.timerId = this.setIntervalFn(() => this.pump(), this.pollMs)
  }

  private stopRunner(): void {
    if (this.timerId !== null) this.clearIntervalFn(this.timerId)
    this.timerId = null
  }

  /** Schedules every tick due within the lookahead window. */
  pump(): void {
    const now = this.host.now()
    const interval = this.intervalSeconds()
    // A stalled tab must not replay a backlog of missed notes all at once.
    if (this.nextTime < now - interval) this.nextTime = now
    while (this.nextTime < now + this.lookaheadSeconds) {
      this.tick(this.nextTime)
      this.nextTime += interval
    }
  }

  private tick(time: number): void {
    const voices = this.activeVoices()
    if (voices.length === 0 || !this.settings) return
    if (this.settings.mode === 'repeat') {
      for (const voice of voices) this.hit(voice, time)
      return
    }
    this.arpNote(voices, time)
  }

  private arpNote(voices: PerformVoice[], time: number): void {
    const settings = this.settings!
    const owners = new Map<number, PerformVoice>()
    for (const voice of voices) for (const midi of voice.midis) owners.set(midi, voice)
    if (owners.size === 0) {
      // Drum or sample pads have no notes to walk — cycle through the held pads instead.
      this.hit(voices[this.step++ % voices.length]!, time)
      return
    }
    const order = arpOrder([...owners.keys()], settings.arpPattern, settings.arpOctaves)
    const midi = settings.arpPattern === 'random' ? order[Math.floor(this.random() * order.length)]! : order[this.step % order.length]!
    this.step++
    const owner = owners.get(midi) ?? owners.get(midi - 12)!
    const note = owner.resolve(midi)
    if (!note) {
      this.hit(owner, time)
      return
    }
    this.host.play(owner.pad, note, time, 1)
    if (note.cents === 0) this.listener?.(owner.pad.id, note.sampleId, time)
  }

  /** One hit of a pad: its own sound, or a strum across its notes. */
  private hit(voice: PerformVoice, time: number): AudioBufferSourceNode[] {
    const settings = this.settings!
    this.listener?.(voice.pad.id, voice.whole.sampleId, time)
    if (settings.strum === 'off' || voice.midis.length < 2) return [this.host.play(voice.pad, voice.whole, time, 1)]
    const midis = [...voice.midis].sort((a, b) => (settings.strum === 'up' ? a - b : b - a))
    const gap = STRUM_SECONDS[settings.strumSpeed]
    // Separate notes add up louder than the one normalized chord sample.
    const level = 1 / Math.sqrt(midis.length)
    const notes = midis.map((midi) => voice.resolve(midi))
    if (notes.some((note) => note === null)) return [this.host.play(voice.pad, voice.whole, time, 1)]
    return notes.map((note, i) => this.host.play(voice.pad, note!, time + i * gap, level))
  }
}

function stopSafely(source: AudioBufferSourceNode): void {
  try {
    source.stop()
  } catch {
    // Already ended.
  }
}
