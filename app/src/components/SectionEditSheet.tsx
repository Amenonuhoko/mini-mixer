import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { BANK_NAMES } from '../state/banks'
import { buildSongTimeline, MAX_FADE_BARS, programmedBanks, sectionBankLevel, sectionFadeBars, STEPS_PER_BAR } from '../engine/songTimeline'
import { Overlay } from './Overlay'
import { MixedStepper } from './MixedStepper'

interface SectionEditSheetProps {
  /** The selected sections; every change below applies to all of them at once. */
  sectionIds: string[]
  onClose: () => void
}

/**
 * Edits one or several song sections together, opened from the Song page's
 * selection bar: fade in / fade out over whole bars, and each sound group's
 * level and on/off. Every control writes straight to all selected sections
 * (and is heard live while one plays); where they differ it says "Mixed"
 * until you change it, which sets them all the same.
 */
export function SectionEditSheet({ sectionIds, onClose }: SectionEditSheetProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const sections = state.songSections.filter((section) => sectionIds.includes(section.id))
  const first = sections[0]
  if (!first) return null

  const ids = sections.map((section) => section.id)
  const nameOf = (id: string) => {
    const index = state.songSections.findIndex((section) => section.id === id)
    return state.songSections[index]?.name || `Section ${index + 1}`
  }
  const names = ids.map(nameOf)
  const subtitle = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ')

  // A fade can be as long as the longest selected section; shorter ones just fade over their whole length.
  const spans = buildSongTimeline(state).filter((span) => ids.includes(span.section.id))
  const maxFade = Math.min(MAX_FADE_BARS, Math.max(1, ...spans.map((span) => Math.ceil((span.endStep - span.startStep) / STEPS_PER_BAR))))

  const used = new Set(sections.flatMap((section) => programmedBanks(state.banks, state.patterns.find((pattern) => pattern.id === section.patternId))))
  const banks = state.banks.filter((bank) => used.has(bank.kind))

  const hearing =
    state.transport.isPlaying && state.transport.playMode === 'song' && state.transport.auditionScope === 'section' && state.transport.auditionSectionId === first.id
  const hear = () => {
    engine.getContext()
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    if (hearing) dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
    else dispatch({ type: 'AUDITION_SONG_SECTION', sectionId: first.id, scope: 'section' })
  }
  const close = () => {
    if (hearing) dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
    onClose()
  }

  const fadeRow = (edge: 'in' | 'out', label: string, hint: string) => (
    <div className="edit-row">
      <div className="edit-row-text">
        <strong>{label}</strong>
        <small>{hint}</small>
      </div>
      <MixedStepper
        label={`${label} length`}
        values={sections.map((section) => sectionFadeBars(section, edge))}
        max={maxFade}
        zeroLabel="Off"
        unit={(bars) => (bars === 1 ? 'bar' : 'bars')}
        decrementTitle={`${label}: one bar shorter`}
        incrementTitle={`${label}: one bar longer`}
        onSet={(bars) =>
          dispatch(
            edge === 'in'
              ? { type: 'SET_SONG_SECTIONS_FADE', sectionIds: ids, fadeInBars: bars }
              : { type: 'SET_SONG_SECTIONS_FADE', sectionIds: ids, fadeOutBars: bars },
          )
        }
      />
    </div>
  )

  return (
    <Overlay onClose={close} title={sections.length === 1 ? 'Edit section' : `Edit ${sections.length} sections`} subtitle={subtitle} className="section-edit">
      <section className="sheet-section">
        <span className="label">Fades</span>
        {fadeRow('in', 'Fade in', 'Every sound rises from silence over the first bars.')}
        {fadeRow('out', 'Fade out', 'Every sound dies away over the last bars.')}
        <p className="muted sheet-note">A fade follows each section&apos;s own length, and a note that is already ringing keeps the level it started at.</p>
      </section>
      <section className="sheet-section" role="group" aria-label="Mix of the selected sections">
        <span className="label">Mix</span>
        {banks.length === 0 && <p className="muted sheet-note">These sections have no steps yet — add some with Edit this, then mix them here.</p>}
        {banks.map(({ kind }) => {
          const levels = sections.map((section) => Math.round(sectionBankLevel(section, kind) * 100))
          const removed = sections.map((section) => section.excludedBanks?.includes(kind) ?? false)
          const allOut = removed.every(Boolean)
          const noneOut = !removed.some(Boolean)
          const level = levels[0] ?? 100
          const readout = allOut ? 'Off' : !noneOut || levels.some((item) => item !== level) ? 'Mixed' : `${level}%`
          return (
            <div className={allOut ? 'song-bank removed' : 'song-bank'} key={kind}>
              <button
                type="button"
                className={noneOut ? 'chip-btn on song-bank-toggle' : 'chip-btn song-bank-toggle'}
                aria-pressed={noneOut}
                aria-label={`${BANK_NAMES[kind]} in the selected sections`}
                title={noneOut ? `Leave ${BANK_NAMES[kind]} out of the selected sections — its steps stay saved` : `Bring ${BANK_NAMES[kind]} into the selected sections`}
                onClick={() => dispatch({ type: 'SET_SONG_SECTIONS_BANK_INCLUDED', sectionIds: ids, bank: kind, included: !noneOut })}
              >
                {BANK_NAMES[kind]}
              </button>
              <input
                type="range"
                className="slider"
                style={{ '--fill': `${level / 100}` } as React.CSSProperties}
                min={0}
                max={100}
                value={level}
                disabled={allOut}
                aria-label={`${BANK_NAMES[kind]} volume in the selected sections`}
                onChange={(event) => dispatch({ type: 'SET_SONG_SECTIONS_BANK_VOLUME', sectionIds: ids, bank: kind, level: Number(event.target.value) })}
              />
              <span className="readout song-bank-level">{readout}</span>
            </div>
          )
        })}
      </section>
      <div className="section-edit-actions">
        <button className="btn" type="button" onClick={hear} disabled={used.size === 0} title={`Play ${nameOf(first.id)} on its own — changes are heard as you make them`}>
          {hearing ? 'Stop' : `▶ Hear ${nameOf(first.id)}`}
        </button>
        <button className="btn btn-primary" type="button" onClick={close}>Done</button>
      </div>
    </Overlay>
  )
}
