import type { AppState, InstrumentPadSnapshot } from '../state/types'

/**
 * Captures every pad a temporary instrument's keys are about to cover,
 * before its keys replace their assignments — used to restore the
 * pre-instrument layout once that temporary instrument is later replaced or
 * removed (see Transport.autoInstrumentPadSnapshot). Reuses an
 * already-active snapshot rather than re-capturing over it, so chaining
 * several quick builds in a row (a Quick preset, then a Loop preset, etc.)
 * can't clobber the *original* pre-instrument layout with an intermediate
 * build's own layout.
 */
export function captureAutoInstrumentPadSnapshot(
  state: Pick<AppState, 'pads' | 'visiblePadCount' | 'transport'>,
  keyCount: number,
): Record<string, InstrumentPadSnapshot> {
  if (state.transport.autoInstrumentPadSnapshot) return state.transport.autoInstrumentPadSnapshot
  return Object.fromEntries(
    state.pads.slice(0, Math.max(state.visiblePadCount, keyCount)).map((pad) => [
      pad.id,
      { sampleId: pad.sampleId, trimStart: pad.trimStart, trimEnd: pad.trimEnd },
    ]),
  )
}
