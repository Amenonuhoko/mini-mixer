import { useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { padLabel } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { MIN_PAD_COUNT } from '../state/constants'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import type { Bank, Pad } from '../state/types'
import { padIdentity } from '../utils/padIdentity'
import { ConfirmDialog } from './ConfirmDialog'
import { EditIcon, MuteIcon, SeqIcon, SwapIcon, TrashIcon } from './icons'
import { Overlay } from './Overlay'
import { PadLibraryPicker } from './PadLibraryPicker'

/**
 * The selected pad's actions, pinned just above the bottom bar on both Pads
 * and Seq — the same bar for the same pad on either page (and just once when
 * both are on screen), always in thumb reach instead of below the grid:
 * Mute, Edit (trim, effects and their on/off), Swap (Drums pulls another
 * sound from the library) and Steps (fill the pad's row in one tap, or
 * remove it).
 */
export function PadActionBar() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { selectedPadId, goToEditPad } = useNavigation()
  const [sheet, setSheet] = useState<'swap' | 'steps' | 'remove' | null>(null)
  const pad = selectedPadId ? state.pads.find((item) => item.id === selectedPadId) : undefined
  const bank = pad ? state.banks.find((item) => item.padIds.includes(pad.id)) : undefined
  const looping = usePadLooping(engine, pad?.id ?? '')

  if (!pad || !bank) {
    return (
      <div className="pad-action-bar empty" role="group" aria-label="Selected pad">
        <span className="pad-action-hint">Tap a pad or a row name to pick it</span>
      </div>
    )
  }

  const identity = padIdentity(state, bank, pad)
  const drums = bank.kind === 'drums'
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const close = () => setSheet(null)

  return (
    <div className="pad-action-bar" role="group" aria-label={`Selected pad: ${identity.name}`}>
      <div className="pad-action-id">
        <span className="pad-action-num readout">{pad.music ? identity.name : identity.number}</span>
        <span className="pad-action-name">
          {identity.icon && <span aria-hidden="true">{identity.icon} </span>}
          {pad.music ? padIdentityDetail(state, pad) : identity.name}
        </span>
        {looping && <span className="chip chip-live">Loop</span>}
      </div>
      <div className="pad-action-buttons">
        <button
          type="button"
          className={pad.muted ? 'action on-warn' : 'action'}
          onClick={() => dispatch({ type: 'SET_PAD_MUTED', padId: pad.id, muted: !pad.muted })}
          aria-pressed={pad.muted}
        >
          <MuteIcon muted={pad.muted} size={16} />
          <span>{pad.muted ? 'Muted' : 'Mute'}</span>
        </button>
        <button
          type="button"
          className={pad.effectsBypassed ? 'action fx-off' : 'action'}
          onClick={() => goToEditPad(pad.id)}
          title={pad.effectsBypassed ? 'Trim and effects — effects are off' : 'Trim and effects'}
        >
          <EditIcon size={16} />
          <span>{pad.effectsBypassed ? 'FX off' : 'Edit'}</span>
        </button>
        {drums && (
          <button type="button" className="action" onClick={() => setSheet('swap')} title="Swap in another sound from the library">
            <SwapIcon size={16} />
            <span>Swap</span>
          </button>
        )}
        <button
          type="button"
          className="action"
          onClick={() => setSheet('steps')}
          disabled={!pattern}
          title="Fill this pad's row in one tap, or remove it"
        >
          <SeqIcon size={16} />
          <span>Steps</span>
        </button>
      </div>

      {sheet === 'swap' && <PadLibraryPicker padId={pad.id} onClose={close} />}
      {sheet === 'steps' && pattern && (
        <StepsMenu
          pad={pad}
          bank={bank}
          stepCount={pattern.stepCount}
          onFill={(steps) => dispatch({ type: 'SET_ROW_STEPS', patternId: pattern.id, padId: pad.id, steps, sampleId: pad.sampleId })}
          onRemove={drums && bank.padIds.length > MIN_PAD_COUNT ? () => setSheet('remove') : null}
          onClose={close}
        />
      )}
      {sheet === 'remove' && (
        <ConfirmDialog
          message={`Remove pad ${identity.number} (${identity.name})? Its programmed steps go with it — its sample stays in the library, and every other pad is unaffected.`}
          confirmLabel="Remove"
          onConfirm={() => {
            dispatch({ type: 'REMOVE_PAD', padId: pad.id })
            close()
          }}
          onCancel={close}
        />
      )}
    </div>
  )
}

/** A melodic pad's second line: its other labels (feel, numeral), or the sound it plays. */
function padIdentityDetail(state: ReturnType<typeof useAppState>['state'], pad: Pad): string {
  const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined
  if (!pad.music) return sample?.label ?? 'Empty pad'
  const label = padLabel(pad.music, state.key, state.padLabels)
  return [label.primary, label.secondary].filter((part) => part && part !== label.name).join(' · ') || sample?.label || 'Empty pad'
}

/** One-tap row fills, across the whole pattern. */
const ROW_FILLS: Array<{ id: string; label: string; hits: (step: number) => boolean }> = [
  { id: 'beats', label: 'Every beat', hits: (i) => i % 4 === 0 },
  { id: 'eighths', label: 'Every 8th', hits: (i) => i % 2 === 0 },
  { id: 'sixteenths', label: 'Every 16th', hits: () => true },
  { id: 'offbeats', label: 'Offbeats', hits: (i) => i % 4 === 2 },
  { id: 'backbeat', label: 'Beats 2 & 4', hits: (i) => i % 16 === 4 || i % 16 === 12 },
  { id: 'clear', label: 'Clear row', hits: () => false },
]

interface StepsMenuProps {
  pad: Pad
  bank: Bank
  stepCount: number
  onFill: (steps: number[]) => void
  onRemove: (() => void) | null
  onClose: () => void
}

/** The pad's row in the sequence: fill it in one tap (the fast way to program a lot on a phone), or remove the pad. */
function StepsMenu({ pad, bank, stepCount, onFill, onRemove, onClose }: StepsMenuProps) {
  const { state } = useAppState()
  const identity = padIdentity(state, bank, pad)
  const fill = (hits: (step: number) => boolean) => {
    onFill(Array.from({ length: stepCount }, (_, i) => i).filter(hits))
    onClose()
  }
  return (
    <Overlay
      onClose={onClose}
      title={`${identity.icon ? `${identity.icon} ` : ''}${identity.name}`}
      subtitle={pad.sampleId ? 'Fill the whole row in one tap — then tap single steps to tweak.' : 'This pad has no sound yet.'}
    >
      <section className="sheet-section" aria-label="Fill">
        <h3 className="label">Fill</h3>
        <div className="row-fills">
          {ROW_FILLS.map((option) => (
            <button key={option.id} type="button" className="row-fill" onClick={() => fill(option.hits)} disabled={!pad.sampleId && option.id !== 'clear'}>
              <span className="row-fill-name">{option.label}</span>
              <span className="style-preview-row" aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={i} className={option.hits(i) ? 'style-preview-cell on' : 'style-preview-cell'} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>
      {onRemove && (
        <section className="sheet-section" aria-label="Pad">
          <div className="row-menu-actions">
            <button type="button" className="btn btn-danger" onClick={onRemove}>
              <TrashIcon size={16} />
              Remove pad
            </button>
          </div>
        </section>
      )}
    </Overlay>
  )
}
