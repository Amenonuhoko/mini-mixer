import type { AppState, Bank, BankKind, BankSound, Pad } from './types'

export const BANK_KINDS: BankKind[] = ['drums', 'bass', 'chords', 'melody']

export const BANK_NAMES: Record<BankKind, string> = {
  drums: 'Drums',
  bass: 'Bass',
  chords: 'Chords',
  melody: 'Melody',
}

export function createBank(id: string, kind: BankKind, padIds: string[] = []): Bank {
  return {
    id,
    kind,
    padIds,
    visibleCount: padIds.length,
    sound: null,
    columns: 0,
    generatedSampleIds: [],
    noteSampleIds: {},
  }
}

export function getBank(state: Pick<AppState, 'banks'>, kind: BankKind): Bank {
  return state.banks.find((bank) => bank.kind === kind) ?? state.banks[0]!
}

export function getActiveBank(state: Pick<AppState, 'banks' | 'activeBankId'>): Bank {
  return state.banks.find((bank) => bank.id === state.activeBankId) ?? state.banks[0]!
}

/** The Drums bank doubles as the sampler: recordings and library sounds are placed here. */
export function getSamplerBank(state: Pick<AppState, 'banks'>): Bank {
  return getBank(state, 'drums')
}

export function bankOfPad(state: Pick<AppState, 'banks'>, padId: string): Bank | undefined {
  return state.banks.find((bank) => bank.padIds.includes(padId))
}

/** The pads a bank is currently showing, in grid order. */
export function visibleBankPads(state: Pick<AppState, 'pads'>, bank: Bank): Pad[] {
  const byId = new Map(state.pads.map((pad) => [pad.id, pad]))
  return bank.padIds
    .slice(0, bank.visibleCount)
    .map((id) => byId.get(id))
    .filter((pad): pad is Pad => pad !== undefined)
}

/** Every showing pad across all banks — what the sequencer plays and what a bounce renders. */
export function playablePads(state: Pick<AppState, 'pads' | 'banks'>): Pad[] {
  return state.banks.flatMap((bank) => visibleBankPads(state, bank))
}

/** Grid columns for a bank: its layout's own width, or 3 across up to a 3×3 and 4 beyond for hand-built/drum banks. */
export function bankColumns(bank: Bank): number {
  if (bank.columns > 0) return bank.columns
  return bank.visibleCount > 9 ? 4 : 3
}

/** A stable identity for a sound, used to remember its effects (AppState.fxBySound). */
export function soundKey(sound: BankSound | null): string | null {
  if (!sound) return null
  switch (sound.type) {
    case 'preset':
      return `preset:${sound.name}`
    case 'kit':
      return `kit:${sound.kitId}`
    case 'recording':
      return `recording:${sound.sampleId}`
  }
}

/** A bank's volume as a 0–1 gain on its pads' levels (see Bank.volume). */
export function bankVolumeScale(bank: Bank | undefined): number {
  return Math.max(0, Math.min(100, bank?.volume ?? 100)) / 100
}
