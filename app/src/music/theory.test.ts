import { describe, expect, it } from 'vitest'
import {
  bankLayout,
  notePool,
  chordFeel,
  chordName,
  chordNumeral,
  chordQuality,
  diatonicChord,
  keyName,
  keyShortName,
  MOODS,
  noteFeel,
  noteName,
  noteNumeral,
  padLabel,
  SCALES,
  SCALE_IDS,
  type MusicalKey,
} from './theory'

const C_MAJOR: MusicalKey = { tonic: 0, scale: 'major', chordColor: 'triad' }
const C_MINOR: MusicalKey = { tonic: 0, scale: 'minor', chordColor: 'triad' }
const F_MAJOR: MusicalKey = { tonic: 5, scale: 'major', chordColor: 'triad' }

describe('spelling', () => {
  it('spells flat keys with flats and sharp keys with sharps', () => {
    expect(noteName(70, F_MAJOR)).toBe('B♭')
    expect(noteName(66, { tonic: 7, scale: 'major', chordColor: 'triad' })).toBe('F♯')
    expect(noteName(63, C_MINOR)).toBe('E♭')
    expect(noteName(60, C_MAJOR, true)).toBe('C4')
  })

  it('names keys long and short', () => {
    expect(keyName({ tonic: 2, scale: 'dorian', chordColor: 'triad' })).toBe('D dorian')
    expect(keyShortName(C_MINOR)).toBe('Cm')
    expect(keyShortName(F_MAJOR)).toBe('F')
  })
})

describe('chords', () => {
  it('builds the seven diatonic triads of C major with the right qualities', () => {
    const names = Array.from({ length: 7 }, (_, degree) =>
      chordName(diatonicChord(C_MAJOR, degree, 60 + SCALES.major.intervals[degree]!), C_MAJOR),
    )
    expect(names).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°'])
  })

  it('builds seventh chords when the key asks for them', () => {
    const key: MusicalKey = { ...C_MAJOR, chordColor: 'seventh' }
    expect(chordName(diatonicChord(key, 0, 60), key)).toBe('Cmaj7')
    expect(chordName(diatonicChord(key, 4, 67), key)).toBe('G7')
    expect(chordName(diatonicChord(key, 6, 71), key)).toBe('Bø7')
  })

  it('identifies qualities regardless of octave spread', () => {
    expect(chordQuality([57, 60, 64])).toBe('min')
    expect(chordQuality([60, 64, 67, 70])).toBe('dom7')
    expect(chordQuality([60, 64])).toBeNull()
  })

  it('writes Roman numerals against the major scale, the way musicians read modes', () => {
    expect(chordNumeral([67, 71, 74], C_MAJOR)).toBe('V')
    expect(chordNumeral([57, 60, 64], C_MAJOR)).toBe('vi')
    expect(chordNumeral([63, 67, 70], C_MINOR)).toBe('♭III')
    expect(chordNumeral([62, 65, 68], C_MINOR)).toBe('ii°')
    expect(chordNumeral([67, 71, 74, 77], C_MAJOR)).toBe('V7')
  })
})

describe('feel words', () => {
  it('gives chords a role relative to home', () => {
    expect(chordFeel([60, 64, 67], C_MAJOR)).toBe('Home')
    expect(chordFeel([65, 69, 72], C_MAJOR)).toBe('Lift')
    expect(chordFeel([67, 71, 74], C_MAJOR)).toBe('Tension')
    expect(chordFeel([57, 60, 64], C_MAJOR)).toBe('Sad')
    // The same C major chord plays a different role in G.
    expect(chordFeel([60, 64, 67], { tonic: 7, scale: 'major', chordColor: 'triad' })).toBe('Lift')
  })

  it('gives notes a role by their distance from home', () => {
    expect(noteFeel(60, C_MAJOR)).toBe('Home')
    expect(noteFeel(67, C_MAJOR)).toBe('Strong')
    expect(noteNumeral(63, C_MINOR)).toBe('♭3')
  })
})

describe('bank layouts', () => {
  it('lays a guided note bank out one octave per row, highest on top', () => {
    const layout = bankLayout('melody', C_MAJOR, 'guided')
    expect(layout.columns).toBe(7)
    expect(layout.pads).toHaveLength(14)
    expect(layout.pads[0]!.midis).toEqual([72]) // top-left: C5
    expect(layout.pads[7]!.midis).toEqual([60]) // second row starts at C4
  })

  it('only ever offers notes that are in the key', () => {
    for (const scale of SCALE_IDS) {
      const key: MusicalKey = { tonic: 9, scale, chordColor: 'triad' }
      const allowed = new Set(SCALES[scale].intervals.map((interval) => (9 + interval) % 12))
      for (const pad of bankLayout('bass', key, 'guided').pads) {
        expect(allowed.has(pad.midis[0]! % 12)).toBe(true)
      }
    }
  })

  it('gives pentatonic scales three octaves so the grid is still full', () => {
    const layout = bankLayout('melody', { tonic: 9, scale: 'minorPentatonic', chordColor: 'triad' }, 'guided')
    expect(layout.columns).toBe(5)
    expect(layout.pads).toHaveLength(15)
  })

  it('offers the seven chords of the key plus home an octave up', () => {
    const layout = bankLayout('chords', C_MAJOR, 'guided')
    expect(layout.pads.map((pad) => chordName(pad.midis, C_MAJOR))).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°', 'C'])
    expect(layout.pads[7]!.midis[0]).toBe(layout.pads[0]!.midis[0]! + 12)
  })

  it('goes fully chromatic in the free layout', () => {
    expect(bankLayout('melody', C_MAJOR, 'free').pads).toHaveLength(24)
    expect(bankLayout('chords', C_MAJOR, 'free').pads).toHaveLength(24)
  })

  it('keeps each bank in its own register', () => {
    // The lowest note is the first pad of the bottom row.
    const lowest = (kind: 'bass' | 'melody') => {
      const layout = bankLayout(kind, C_MAJOR, 'guided')
      return layout.pads[layout.pads.length - layout.columns]!.midis[0]
    }
    expect(lowest('bass')).toBe(36)
    expect(lowest('melody')).toBe(60)
  })
})

describe('note pool', () => {
  it('covers every pad note plus an octave above, only in the key', () => {
    const layout = bankLayout('chords', C_MAJOR, 'guided')
    const pool = notePool(layout.pads)
    const padNotes = layout.pads.flatMap((pad) => pad.midis)
    for (const midi of padNotes) expect(pool).toContain(midi)
    expect(Math.max(...pool)).toBe(Math.max(...padNotes) + 12)
    expect(pool.every((midi) => [0, 2, 4, 5, 7, 9, 11].includes(midi % 12))).toBe(true)
  })
})

describe('labels', () => {
  it('composes the enabled parts, name first', () => {
    const chord = { kind: 'chord' as const, midis: [57, 60, 64] }
    expect(padLabel(chord, C_MAJOR, { feel: true, name: true, numeral: false })).toMatchObject({ primary: 'Am', secondary: 'Sad' })
    expect(padLabel(chord, C_MAJOR, { feel: true, name: false, numeral: true })).toMatchObject({ primary: 'Sad', secondary: 'vi' })
  })

  it('falls back to the name when every part is switched off', () => {
    const note = { kind: 'note' as const, midis: [67] }
    expect(padLabel(note, C_MAJOR, { feel: false, name: false, numeral: false }).primary).toBe('G4')
  })
})

describe('moods', () => {
  it('each mood maps to a valid key', () => {
    for (const mood of MOODS) {
      expect(SCALES[mood.key.scale]).toBeDefined()
      expect(mood.key.tonic).toBeGreaterThanOrEqual(0)
      expect(mood.key.tonic).toBeLessThan(12)
    }
  })
})
