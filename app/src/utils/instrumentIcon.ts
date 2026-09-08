import type { DrumVoiceKind } from '../engine/drumSynth'
import type { Instrument } from '../state/types'

/** Bundled presets get a recognizable glyph by name; anything else falls back by source. */
const PRESET_ICONS: Record<string, string> = {
  Piano: '🎹',
  Bass: '🎸',
  Lead: '🎺',
  Pad: '🌫️',
  Pluck: '🪕',
  Organ: '⛪',
  Bell: '🔔',
  Guitar: '🎸',
  'Acoustic Drums': '🥁',
  'Cymbals & Metal': '💿',
  'Hand Percussion': '🪘',
  'Electronic Drums': '⚡',
}

/** A small, stable glyph for an instrument — shown on any pad holding one of its keys. */
export function instrumentIcon(instrument: Instrument): string {
  return PRESET_ICONS[instrument.name] ?? (instrument.source === 'recording' ? '🎤' : '🎼')
}

/** Looks up a bundled preset's glyph by name alone — for places (like a preset picker) that have a preset's name but no full Instrument object yet to hand instrumentIcon(). */
export function instrumentIconForName(name: string): string {
  return PRESET_ICONS[name] ?? '🎼'
}

/** A distinct glyph per drum voice kind — shown on a pad instead of instrumentIcon()'s single per-instrument glyph, since a Drum Kit's keys are genuinely different sounds (kick vs. snare vs. hi-hat), not the same sound pitch-shifted like every other bundled preset's keys are. */
const DRUM_VOICE_ICONS: Record<DrumVoiceKind, string> = {
  kick: '🥁',
  snare: '🪘',
  hihat: '✨',
  clap: '👏',
  tom: '🛢️',
  rim: '🎯',
  cowbell: '🛎️',
  crash: '💥',
  china: '💥',
  ride: '💿',
  shaker: '✨',
  tambourine: '🪘',
  claves: '🎯',
  conga: '🪘',
  bongo: '🪘',
}

export function drumVoiceIcon(kind: DrumVoiceKind): string {
  return DRUM_VOICE_ICONS[kind]
}
