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
  'Drum Kit': '🥁',
}

/** A small, stable glyph for an instrument — shown on any pad holding one of its keys. */
export function instrumentIcon(instrument: Instrument): string {
  return PRESET_ICONS[instrument.name] ?? (instrument.source === 'recording' ? '🎤' : '🎼')
}

/** Looks up a bundled preset's glyph by name alone — for places (like a preset picker) that have a preset's name but no full Instrument object yet to hand instrumentIcon(). */
export function instrumentIconForName(name: string): string {
  return PRESET_ICONS[name] ?? '🎼'
}
