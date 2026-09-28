import { describe, expect, it } from 'vitest'
import { keyLabel, keysOwnedElsewhere, padIndexForCode, padKeyAt } from './keyboard'

describe('pad keys', () => {
  it('lays a 3×3 kit under Q, A and Z rows, bottom row to bottom row', () => {
    expect(padKeyAt(0, 3, 9)?.code).toBe('KeyQ')
    expect(padKeyAt(2, 3, 9)?.code).toBe('KeyE')
    expect(padKeyAt(3, 3, 9)?.code).toBe('KeyA')
    expect(padKeyAt(6, 3, 9)?.code).toBe('KeyZ')
    expect(padKeyAt(8, 3, 9)?.code).toBe('KeyC')
    expect(padIndexForCode('KeyZ', 3, 9)).toBe(6)
    expect(padIndexForCode('KeyQ', 3, 9)).toBe(0)
    // The number row is above a three-row grid's reach.
    expect(padIndexForCode('Digit1', 3, 9)).toBeNull()
  })

  it('puts a melodic bank’s lower octave on the lower row of keys', () => {
    // 7 columns × 2 rows: the top row (higher octave) on A…, the bottom (lower) on Z….
    expect(padKeyAt(0, 7, 14)?.code).toBe('KeyA')
    expect(padKeyAt(7, 7, 14)?.code).toBe('KeyZ')
    expect(padKeyAt(13, 7, 14)?.label).toBe('M')
    expect(padIndexForCode('KeyM', 7, 14)).toBe(13)
  })

  it('reaches only the bottom four rows of a tall grid, and only ten columns', () => {
    expect(padKeyAt(0, 4, 32)).toBeNull()
    expect(padKeyAt(16, 4, 32)?.code).toBe('Digit1')
    expect(padKeyAt(31, 4, 32)?.code).toBe('KeyV')
    expect(padIndexForCode('KeyV', 4, 32)).toBe(31)
    expect(padIndexForCode('Comma', 4, 32)).toBeNull()
    expect(padIndexForCode('KeyA', 12, 12)).toBeNull()
    expect(padKeyAt(11, 12, 12)).toBeNull()
  })

  it('never names a key past the last pad of a partial row', () => {
    expect(padKeyAt(7, 3, 8)?.code).toBe('KeyX')
    expect(padIndexForCode('KeyC', 3, 8)).toBeNull()
    expect(padKeyAt(3, 3, 0)).toBeNull()
    expect(padIndexForCode('KeyZ', 0, 9)).toBeNull()
  })

  it('prints the cap, not the code', () => {
    expect(keyLabel('KeyQ')).toBe('Q')
    expect(keyLabel('Digit0')).toBe('0')
    expect(keyLabel('Semicolon')).toBe(';')
    expect(keyLabel('Slash')).toBe('/')
  })
})

describe('keysOwnedElsewhere', () => {
  it('leaves the keyboard to text fields, selects, sliders and open dialogs', () => {
    document.body.innerHTML = '<input id="i"><select id="s"></select><output id="o" role="slider"></output><button id="b"></button>'
    expect(keysOwnedElsewhere(document.getElementById('i'))).toBe(true)
    expect(keysOwnedElsewhere(document.getElementById('s'))).toBe(true)
    expect(keysOwnedElsewhere(document.getElementById('o'))).toBe(true)
    expect(keysOwnedElsewhere(document.getElementById('b'))).toBe(false)
    expect(keysOwnedElsewhere(document.body)).toBe(false)
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog"></div>')
    expect(keysOwnedElsewhere(document.body)).toBe(true)
    document.body.innerHTML = ''
  })
})
