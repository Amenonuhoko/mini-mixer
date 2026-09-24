import type { DrumVoiceKind } from '../engine/drumSynth'

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
  'Alto Saxophone': '🎷',
  Trumpet: '🎺',
  Flute: '🪈',
  Clarinet: '🎶',
  'Acoustic Drums': '🥁',
  'Cymbals & Metal': '💿',
  'Hand Percussion': '🪘',
  'Electronic Drums': '⚡',
}

/** A bundled sound's glyph by name — shown on bank tabs and in the sound picker. */
export function instrumentIconForName(name: string): string {
  return PRESET_ICONS[name] ?? '🎼'
}

/** A distinct glyph per drum voice kind — a kit's pads are genuinely different sounds (kick vs. snare vs. hi-hat), so each gets its own. */
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
