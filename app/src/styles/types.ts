import type { DrumKitPreset } from '../engine/drumSynth'
import type { MoodId } from '../music/theory'

/**
 * A rhythm line, one character per 16th note: `x` always, `o` often (65%),
 * `-` sometimes (25%), `.` never. Sixteen characters describe one bar and
 * repeat for every bar; a line exactly as long as the whole pattern spells
 * every bar out.
 */
export type Pulse = string

/** What a drum line plays — resolved to whichever pad of the loaded kit fits (see generator.ts). */
export type DrumRole = 'kick' | 'snare' | 'ghost' | 'clap' | 'rim' | 'hat' | 'openHat' | 'ride' | 'crash' | 'tom' | 'perc' | 'shaker'

/**
 * A musical style, as data. The generator (generator.ts) reads nothing but
 * this, so a new genre is a new object in library.ts — no code. Every
 * choice with alternatives (progressions, rhythm lines) is a list the
 * seeded generator picks from, and every `o`/`-` in a line is rolled, so
 * one style yields endless variations that still sound like the style.
 */
export interface StyleDef {
  id: string
  name: string
  blurb: string
  /** Tempo range; a starter beat picks inside it. */
  bpm: [number, number]
  /** Moods that suit the style. A starter beat keeps the project's mood if it's one of these, else takes the first. */
  moods: MoodId[]
  /** Pattern length in bars (16 steps each). */
  bars: 1 | 2 | 4
  /** 0 = straight … 1 = full triplet shuffle. Applied from Phase 3 (feel). */
  swing: number
  /** The sound each bank gets for a starter beat. */
  sounds: { drums: DrumKitPreset['id']; bass: string; chords: string; melody: string }
  /** Chord progressions as scale degrees (0 = home), spread evenly over the pattern. */
  progressions: number[][]
  drums: {
    /** Alternatives per role; one is picked per beat. */
    lines: Partial<Record<DrumRole, Pulse[]>>
    /** Replaces a role's line in the last bar — the turnaround. */
    fills?: Partial<Record<DrumRole, Pulse>>
  }
  bass: {
    rhythms: Pulse[]
    /** Relative odds of each note choice on a hit. */
    notes: { root: number; fifth: number; octave: number }
    /** Chance the last hit before a chord change walks into the next root. */
    approach: number
  }
  chords: {
    rhythms: Pulse[]
  }
  melody: {
    rhythms: Pulse[]
    /** Chance a note leaps (3–4 scale steps) instead of stepping. */
    leap: number
    register: 'low' | 'mid' | 'high'
  }
}
