/**
 * Pure music theory: keys, scales, diatonic chords, and the three ways a pad
 * can be labeled — its *name* (C, Am7), its *numeral* (I, vi7, ♭3), and its
 * *feel* (Home, Lift, Tension) for people who don't read music. No audio, no
 * React: everything here is deterministic and unit-tested.
 */

export type ScaleId =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'harmonicMinor'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'blues'

export type ChordColor = 'triad' | 'seventh'

export interface MusicalKey {
  /** Pitch class of the key's home note, 0 = C … 11 = B. */
  tonic: number
  scale: ScaleId
  /** Whether chord pads are plain triads or richer seventh chords. */
  chordColor: ChordColor
}

interface ScaleDefinition {
  name: string
  intervals: readonly number[]
  /** Broad color, which decides the feel of each chord degree. */
  family: 'major' | 'minor'
  /** The seven-note scale chords are built from (pentatonic scales borrow their parent's). */
  chordScale: ScaleId
  /** Semitones from this scale's tonic to its parent major key — decides ♯ vs ♭ spelling. */
  parentMajorOffset: number
}

export const SCALES: Record<ScaleId, ScaleDefinition> = {
  major: { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11], family: 'major', chordScale: 'major', parentMajorOffset: 0 },
  minor: { name: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10], family: 'minor', chordScale: 'minor', parentMajorOffset: 3 },
  dorian: { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], family: 'minor', chordScale: 'dorian', parentMajorOffset: 10 },
  phrygian: { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], family: 'minor', chordScale: 'phrygian', parentMajorOffset: 8 },
  lydian: { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], family: 'major', chordScale: 'lydian', parentMajorOffset: 7 },
  mixolydian: { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], family: 'major', chordScale: 'mixolydian', parentMajorOffset: 5 },
  harmonicMinor: { name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], family: 'minor', chordScale: 'harmonicMinor', parentMajorOffset: 3 },
  majorPentatonic: { name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9], family: 'major', chordScale: 'major', parentMajorOffset: 0 },
  minorPentatonic: { name: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10], family: 'minor', chordScale: 'minor', parentMajorOffset: 3 },
  blues: { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10], family: 'minor', chordScale: 'minor', parentMajorOffset: 3 },
}

export const SCALE_IDS = Object.keys(SCALES) as ScaleId[]

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
/** Parent major keys written with flats: F, B♭, E♭, A♭, D♭, G♭. */
const FLAT_MAJOR_KEYS = new Set([5, 10, 3, 8, 1, 6])

export function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12
}

function usesFlats(key: MusicalKey): boolean {
  return FLAT_MAJOR_KEYS.has(pitchClass(key.tonic + SCALES[key.scale].parentMajorOffset))
}

/** A pitch class spelled the way this key would write it (B♭ in F major, A♯ in B major). */
export function pitchName(pc: number, key: MusicalKey): string {
  return (usesFlats(key) ? FLAT_NAMES : SHARP_NAMES)[pitchClass(pc)]!
}

/** Scientific-pitch note name, e.g. C4 for MIDI 60. */
export function noteName(midi: number, key: MusicalKey, withOctave = false): string {
  const name = pitchName(midi, key)
  return withOctave ? `${name}${Math.floor(midi / 12) - 1}` : name
}

export function keyName(key: MusicalKey): string {
  return `${pitchName(key.tonic, key)} ${SCALES[key.scale].name.toLowerCase()}`
}

/** Short form for a compact chip: "C", "Am", "D dor". */
export function keyShortName(key: MusicalKey): string {
  const name = pitchName(key.tonic, key)
  switch (key.scale) {
    case 'major':
      return name
    case 'minor':
      return `${name}m`
    default:
      return `${name} ${SCALES[key.scale].name.slice(0, 3).toLowerCase()}`
  }
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export type ChordQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'maj7'
  | 'dom7'
  | 'min7'
  | 'halfDim7'
  | 'dim7'
  | 'minMaj7'
  | 'augMaj7'

const QUALITY_BY_SHAPE: Record<string, ChordQuality> = {
  '4,7': 'maj',
  '3,7': 'min',
  '3,6': 'dim',
  '4,8': 'aug',
  '4,7,11': 'maj7',
  '4,7,10': 'dom7',
  '3,7,10': 'min7',
  '3,6,10': 'halfDim7',
  '3,6,9': 'dim7',
  '3,7,11': 'minMaj7',
  '4,8,11': 'augMaj7',
}

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  maj: '',
  min: 'm',
  dim: '°',
  aug: '+',
  maj7: 'maj7',
  dom7: '7',
  min7: 'm7',
  halfDim7: 'ø7',
  dim7: '°7',
  minMaj7: 'm(maj7)',
  augMaj7: '+maj7',
}

/** Whether a quality reads as "major" (uppercase numeral) — minor and diminished read lowercase. */
function isMajorish(quality: ChordQuality): boolean {
  return quality === 'maj' || quality === 'aug' || quality === 'maj7' || quality === 'dom7' || quality === 'augMaj7'
}

/** Identifies a chord's quality from its notes (root first, any octave spread). */
export function chordQuality(midis: readonly number[]): ChordQuality | null {
  if (midis.length < 3) return null
  const root = midis[0]!
  const shape = [...new Set(midis.slice(1).map((midi) => pitchClass(midi - root)))].sort((a, b) => a - b).join(',')
  return QUALITY_BY_SHAPE[shape] ?? null
}

export function chordName(midis: readonly number[], key: MusicalKey): string {
  const quality = chordQuality(midis)
  return `${pitchName(midis[0]!, key)}${quality ? QUALITY_SUFFIX[quality] : ''}`
}

/**
 * The chord built on one degree of the key's chord scale, by stacking thirds
 * from the scale itself — so it's always "in key". `rootMidi` places the
 * chord's root; the rest stack upward from it.
 */
export function diatonicChord(key: MusicalKey, degree: number, rootMidi: number): number[] {
  const intervals = SCALES[SCALES[key.scale].chordScale].intervals
  const size = key.chordColor === 'seventh' ? 4 : 3
  const notes: number[] = []
  for (let i = 0; i < size; i++) {
    const index = degree + i * 2
    const octave = Math.floor(index / intervals.length)
    notes.push(intervals[index % intervals.length]! + 12 * octave)
  }
  const base = notes[0]!
  return notes.map((interval) => rootMidi + interval - base)
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
/** Interval name from the tonic, used for both note numerals and chord accidentals. */
const INTERVAL_NAMES = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7']
/** For a chord root this many semitones above the tonic: which Roman numeral, and what accidental. */
const ROOT_NUMERAL: Array<{ roman: number; accidental: string }> = [
  { roman: 0, accidental: '' },
  { roman: 1, accidental: '♭' },
  { roman: 1, accidental: '' },
  { roman: 2, accidental: '♭' },
  { roman: 2, accidental: '' },
  { roman: 3, accidental: '' },
  { roman: 3, accidental: '♯' },
  { roman: 4, accidental: '' },
  { roman: 5, accidental: '♭' },
  { roman: 5, accidental: '' },
  { roman: 6, accidental: '♭' },
  { roman: 6, accidental: '' },
]

/**
 * A chord's Roman numeral within the key: uppercase for major-ish chords,
 * lowercase for minor/diminished, with ° / ø / + / 7 marks. Accidentals are
 * measured against the *major* scale on the tonic, so a C minor key's E♭
 * chord reads ♭III — the convention musicians actually use across modes.
 */
export function chordNumeral(midis: readonly number[], key: MusicalKey): string {
  const quality = chordQuality(midis)
  const { roman, accidental } = ROOT_NUMERAL[pitchClass(midis[0]! - key.tonic)]!
  const base = ROMAN[roman]!
  const numeral = quality && !isMajorish(quality) ? base.toLowerCase() : base
  const mark =
    quality === 'dim' ? '°'
    : quality === 'aug' ? '+'
    : quality === 'maj7' ? 'maj7'
    : quality === 'dom7' || quality === 'min7' ? '7'
    : quality === 'halfDim7' ? 'ø7'
    : quality === 'dim7' ? '°7'
    : quality === 'minMaj7' ? '(maj7)'
    : quality === 'augMaj7' ? '+maj7'
    : ''
  return `${accidental}${numeral}${mark}`
}

/** A single note's degree name relative to the tonic: 1, ♭3, 5… */
export function noteNumeral(midi: number, key: MusicalKey): string {
  return INTERVAL_NAMES[pitchClass(midi - key.tonic)]!
}

// ---------------------------------------------------------------------------
// Feel words — plain-language roles for people who don't read music
// ---------------------------------------------------------------------------

/** What each note *does* relative to home, whatever the key. */
const NOTE_FEEL = ['Home', 'Dark', 'Step', 'Moody', 'Bright', 'Lift', 'Edge', 'Strong', 'Sad', 'Sweet', 'Cool', 'Pull']

export function noteFeel(midi: number, key: MusicalKey): string {
  return NOTE_FEEL[pitchClass(midi - key.tonic)]!
}

/**
 * What a chord *does* in this key. Decided by where its root sits relative to
 * home and whether it's major or minor there — the same C major chord is
 * "Home" in C, "Lift" in G, and "Rise" in D minor.
 */
export function chordFeel(midis: readonly number[], key: MusicalKey): string {
  const quality = chordQuality(midis)
  const interval = pitchClass(midis[0]! - key.tonic)
  const major = quality ? isMajorish(quality) : true
  if (quality === 'dim' || quality === 'halfDim7' || quality === 'dim7') return 'Edge'
  if (quality === 'aug' || quality === 'augMaj7') return 'Strange'
  switch (interval) {
    case 0:
      return 'Home'
    case 1:
      return 'Dark'
    case 2:
      return major ? 'Bright' : 'Soft'
    case 3:
      return 'Warm'
    case 4:
      return major ? 'Glow' : 'Wistful'
    case 5:
      return major ? 'Lift' : 'Longing'
    case 6:
      return 'Edge'
    case 7:
      return major ? 'Tension' : 'Drift'
    case 8:
      return 'Hope'
    case 9:
      return major ? 'Bold' : 'Sad'
    case 10:
      return major ? 'Rise' : 'Shadow'
    default:
      return major ? 'Tension' : 'Shadow'
  }
}

// ---------------------------------------------------------------------------
// Moods — a key chosen for you, for people who don't think in keys
// ---------------------------------------------------------------------------

export type MoodId = 'bright' | 'chill' | 'dreamy' | 'soulful' | 'dark' | 'tense' | 'epic'

export interface Mood {
  id: MoodId
  name: string
  blurb: string
  key: MusicalKey
}

export const MOODS: Mood[] = [
  { id: 'bright', name: 'Bright', blurb: 'Happy, open, sunny', key: { tonic: 0, scale: 'major', chordColor: 'triad' } },
  { id: 'chill', name: 'Chill', blurb: 'Laid-back, jazzy', key: { tonic: 2, scale: 'dorian', chordColor: 'seventh' } },
  { id: 'dreamy', name: 'Dreamy', blurb: 'Floating, wide open', key: { tonic: 5, scale: 'lydian', chordColor: 'seventh' } },
  { id: 'soulful', name: 'Soulful', blurb: 'Warm, smooth, R&B', key: { tonic: 3, scale: 'major', chordColor: 'seventh' } },
  { id: 'dark', name: 'Dark', blurb: 'Moody and heavy', key: { tonic: 0, scale: 'minor', chordColor: 'triad' } },
  { id: 'tense', name: 'Tense', blurb: 'Suspense, on edge', key: { tonic: 4, scale: 'phrygian', chordColor: 'triad' } },
  { id: 'epic', name: 'Epic', blurb: 'Big and cinematic', key: { tonic: 2, scale: 'minor', chordColor: 'triad' } },
]

export const DEFAULT_KEY: MusicalKey = MOODS[0]!.key

export function moodById(id: MoodId): Mood {
  return MOODS.find((mood) => mood.id === id) ?? MOODS[0]!
}

// ---------------------------------------------------------------------------
// Pad layouts — which notes/chords a melodic bank's pads play
// ---------------------------------------------------------------------------

export type BankKind = 'drums' | 'bass' | 'chords' | 'melody'
/** Guided = only what's in the key; Free = every semitone (notes) or every root (chords). */
export type PadLayout = 'guided' | 'free'

export interface PadMusic {
  kind: 'note' | 'chord'
  /** The notes this pad sounds, low to high (a single note, or a chord's voicing). */
  midis: number[]
}

export interface BankLayout {
  columns: number
  pads: PadMusic[]
}

/** Where a bank's home note sits, so each bank lives in its natural register. */
export function tonicMidi(kind: BankKind, tonic: number): number {
  const pc = pitchClass(tonic)
  switch (kind) {
    case 'bass':
      return 36 + pc // C2–B2
    case 'chords':
      return pc >= 5 ? 48 + pc : 60 + pc // roots from F3 to E4 keep chords out of the mud
    default:
      return 60 + pc // C4–B4
  }
}

/**
 * The pads a melodic bank shows for a key. Note banks lay each octave out as
 * one row (column = scale degree, so a column always has the same role), the
 * highest octave on top like a stacked keyboard. The guided chord bank is the
 * seven chords of the key plus home an octave up; the free chord bank is a
 * major and minor chord on every root.
 */
export function bankLayout(kind: Exclude<BankKind, 'drums'>, key: MusicalKey, layout: PadLayout): BankLayout {
  const base = tonicMidi(kind, key.tonic)

  if (kind === 'chords') {
    if (layout === 'guided') {
      const intervals = SCALES[SCALES[key.scale].chordScale].intervals
      const pads = Array.from({ length: 8 }, (_, degree) => {
        const octave = Math.floor(degree / intervals.length)
        const root = base + intervals[degree % intervals.length]! + 12 * octave
        return { kind: 'chord' as const, midis: diatonicChord(key, degree % intervals.length, root) }
      })
      return { columns: 4, pads }
    }
    const pads: PadMusic[] = []
    for (const minor of [false, true]) {
      for (let step = 0; step < 12; step++) {
        const root = base + step
        const shape = key.chordColor === 'seventh' ? (minor ? [0, 3, 7, 10] : [0, 4, 7, 11]) : minor ? [0, 3, 7] : [0, 4, 7]
        pads.push({ kind: 'chord', midis: shape.map((interval) => root + interval) })
      }
    }
    return { columns: 6, pads }
  }

  if (layout === 'free') {
    // Two octaves, six semitones per row, highest row on top.
    const rows: PadMusic[][] = []
    for (let row = 0; row < 4; row++) {
      rows.push(Array.from({ length: 6 }, (_, i) => ({ kind: 'note' as const, midis: [base + row * 6 + i] })))
    }
    return { columns: 6, pads: rows.reverse().flat() }
  }

  const intervals = SCALES[key.scale].intervals
  const octaves = intervals.length <= 5 ? 3 : 2
  const rows: PadMusic[][] = []
  for (let octave = 0; octave < octaves; octave++) {
    rows.push(intervals.map((interval) => ({ kind: 'note' as const, midis: [base + 12 * octave + interval] })))
  }
  return { columns: intervals.length, pads: rows.reverse().flat() }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * Every single note a bank keeps rendered: each pitch class its pads use,
 * from the lowest pad note up to an octave above the highest — so an
 * arpeggio can climb an extra octave over any chord or note and still hit
 * real rendered notes, all of them in the key on a guided layout.
 */
export function notePool(pads: readonly PadMusic[]): number[] {
  const midis = pads.flatMap((pad) => pad.midis)
  if (midis.length === 0) return []
  const pitchClasses = new Set(midis.map(pitchClass))
  const low = Math.min(...midis)
  const high = Math.max(...midis) + 12
  return Array.from({ length: high - low + 1 }, (_, i) => low + i).filter((midi) => pitchClasses.has(pitchClass(midi)))
}

export interface PadLabelSettings {
  feel: boolean
  name: boolean
  numeral: boolean
}

export const DEFAULT_PAD_LABELS: PadLabelSettings = { feel: true, name: true, numeral: false }

export interface PadLabel {
  /** The big text on the pad. */
  primary: string
  /** Smaller supporting text (may be empty). */
  secondary: string
  /** Chord/note name — always available for places that need a compact tag (sequencer rows). */
  name: string
}

/** Composes a pad's label from whichever parts are switched on, name first when present. */
export function padLabel(music: PadMusic, key: MusicalKey, settings: PadLabelSettings): PadLabel {
  const name = music.kind === 'chord' ? chordName(music.midis, key) : noteName(music.midis[0]!, key, true)
  const numeral = music.kind === 'chord' ? chordNumeral(music.midis, key) : noteNumeral(music.midis[0]!, key)
  const feel = music.kind === 'chord' ? chordFeel(music.midis, key) : noteFeel(music.midis[0]!, key)
  const parts = [settings.name ? name : null, settings.feel ? feel : null, settings.numeral ? numeral : null].filter(
    (part): part is string => part !== null,
  )
  if (parts.length === 0) return { primary: name, secondary: '', name }
  return { primary: parts[0]!, secondary: parts.slice(1).join(' · '), name }
}
