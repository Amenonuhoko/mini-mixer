/**
 * Playing the pads from a computer keyboard.
 *
 * Keys are matched by physical position (`KeyboardEvent.code`), so the map is
 * the same shape on every keyboard layout: the four letter/number rows of
 * the keyboard are the bottom four rows of the pad grid, bottom row to
 * bottom row — Z X C … under the lowest row of pads, A S D … above it, then
 * Q W E …, then 1 2 3 …. That's how drum racks and pianos read: the home
 * row of pads under the fingers, lower on the keyboard is lower in the grid
 * (a melodic bank's lower octave). A grid wider than ten pads or taller than
 * four rows leaves the rest to the mouse.
 */
const KEY_ROWS: readonly (readonly string[])[] = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
]

const PUNCTUATION_LABELS: Record<string, string> = { Semicolon: ';', Comma: ',', Period: '.', Slash: '/' }

export interface PadKey {
  /** The physical key, as KeyboardEvent.code. */
  code: string
  /** What to print on the pad: Q, 7, ; … */
  label: string
}

/** The cap printed on a key — for the hint on its pad. */
export function keyLabel(code: string): string {
  return PUNCTUATION_LABELS[code] ?? code.replace(/^(Key|Digit)/, '')
}

/** Which keyboard row (0 = number row … 3 = Z row) a pad grid row maps to, or null when it's above the keyboard's reach. */
function keyRowForPadRow(padRow: number, columns: number, count: number): number | null {
  const rowCount = Math.ceil(count / columns)
  const keyRow = KEY_ROWS.length - (rowCount - padRow)
  return keyRow >= 0 && keyRow < KEY_ROWS.length ? keyRow : null
}

/** The key that plays the pad at `index` in a grid of `columns` holding `count` pads, or null when it has none. */
export function padKeyAt(index: number, columns: number, count: number): PadKey | null {
  if (columns <= 0 || index < 0 || index >= count) return null
  const column = index % columns
  const keyRow = keyRowForPadRow(Math.floor(index / columns), columns, count)
  if (keyRow === null) return null
  const code = KEY_ROWS[keyRow]![column]
  return code ? { code, label: keyLabel(code) } : null
}

/** The pad a key plays in a grid of `columns` holding `count` pads, or null when the key isn't one of the pads'. */
export function padIndexForCode(code: string, columns: number, count: number): number | null {
  if (columns <= 0) return null
  for (let keyRow = 0; keyRow < KEY_ROWS.length; keyRow++) {
    const column = KEY_ROWS[keyRow]!.indexOf(code)
    if (column < 0) continue
    if (column >= columns) return null
    const rowCount = Math.ceil(count / columns)
    const padRow = rowCount - (KEY_ROWS.length - keyRow)
    if (padRow < 0) return null
    const index = padRow * columns + column
    return index < count ? index : null
  }
  return null
}

/**
 * True when a key press belongs to whatever has focus rather than to the
 * instrument: text being typed, a select or slider being adjusted, or any
 * open sheet or popover (a dialog) that should keep the keyboard to itself.
 */
export function keysOwnedElsewhere(target: EventTarget | null): boolean {
  if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return true
  if (!(target instanceof Element)) return false
  return target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"]') !== null
}
