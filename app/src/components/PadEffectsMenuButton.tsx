import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  EFFECT_IDS,
  EFFECT_MAX,
  EFFECT_MIN,
  EFFECT_PRESETS,
  EFFECT_STEP,
  NEUTRAL_EFFECT_VALUE,
  type EffectPreset,
} from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useIsWideScreen } from '../hooks/useIsWideScreen'
import type { EffectId } from '../state/types'
import { EffectsSwitch } from './EffectsSwitch'

const FLOAT_MARGIN = 8

interface FloatingPosition {
  top: number
  left: number
}

/**
 * Where to place the panel next to an anchor element (the last-played pad on
 * mobile, or the toggle button itself on a wide desktop layout), clamped
 * fully inside the viewport. Prefers sitting below the anchor and only flips
 * above when there isn't room — the same "flip if clipped" logic a tooltip/
 * popover needs. Centers on the anchor when following a pad (so it doesn't
 * read as lopsided next to a small square tile); left-aligns to the anchor
 * when it's the header button (matching how the popover always used to hang
 * off that button's left edge before it needed real position math).
 */
function computeAnchoredPosition(
  anchorRect: DOMRect,
  panelSize: { width: number; height: number },
  align: 'center' | 'left',
): FloatingPosition {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const fitsBelow = anchorRect.bottom + FLOAT_MARGIN + panelSize.height <= viewportHeight
  const top = fitsBelow
    ? anchorRect.bottom + FLOAT_MARGIN
    : Math.max(FLOAT_MARGIN, anchorRect.top - FLOAT_MARGIN - panelSize.height)
  const idealLeft =
    align === 'center' ? anchorRect.left + anchorRect.width / 2 - panelSize.width / 2 : anchorRect.left
  const left = Math.min(
    Math.max(FLOAT_MARGIN, idealLeft),
    viewportWidth - panelSize.width - FLOAT_MARGIN,
  )
  return { top, left: Math.max(FLOAT_MARGIN, left) }
}

const CUSTOM_PRESETS_KEY = 'mini-mixer.custom-effect-presets'
const CHARACTER_EFFECT_IDS = ['filter', 'grit', 'echo', 'reverb'] as const
const CHARACTER_EFFECT_LABELS: Record<(typeof CHARACTER_EFFECT_IDS)[number], string> = {
  filter: 'Filter',
  grit: 'Grit',
  echo: 'Echo',
  reverb: 'Reverb',
}

function formatDialValue(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : String(value)
}

function readCustomPresets(): EffectPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((preset): preset is EffectPreset =>
          typeof preset === 'object' && preset !== null && typeof (preset as EffectPreset).name === 'string',
        )
      : []
  } catch { return [] }
}

interface PadEffectsMenuButtonProps {
  /** The most recently played/tapped pad's id, if any — on mobile, the open panel floats next to it instead of staying anchored under the header button (see the floating-position effect below). */
  followPadId?: string | null
}

/** Compact grid-wide effect controls, portaled to `document.body` like every
 * other popup in the app (see Overlay.tsx) — `.app-shell` is `position:
 * fixed`, which per spec always opens its own stacking context, so a panel
 * left as its DOM descendant would have its z-index trapped inside that
 * context and could end up visually underneath a fixed sibling of
 * `.app-shell` (the top nav, the FAB cluster) no matter how high its own
 * z-index reads. On mobile, the open panel floats next to whichever pad was
 * last played (see `followPadId`) instead of staying anchored under the
 * header button — the pad grid can be much taller than the header, so an
 * anchored popover can end up far from where you're actually playing. On a
 * wide desktop layout there's no such reachability problem, so it stays
 * anchored to the button there, just positioned by the same math instead of
 * plain CSS (necessary once portaling took away the CSS-relative anchor).
 * The preview bars make the Filter/Grit/Echo/Reverb balance readable before
 * choosing a preset. */
export function PadEffectsMenuButton({ followPadId = null }: PadEffectsMenuButtonProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const isWide = useIsWideScreen()
  const [open, setOpen] = useState(false)
  const [customPresets, setCustomPresets] = useState<EffectPreset[]>(readCustomPresets)
  const [position, setPosition] = useState<FloatingPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const allPresets = [...EFFECT_PRESETS, ...customPresets]
  const anyBypassed = visiblePads.some((pad) => pad.effectsBypassed)
  const anyCustomized = visiblePads.some((pad) =>
    pad.effects.some((effect) => effect.value !== NEUTRAL_EFFECT_VALUE),
  )
  const floating = open && !isWide && followPadId !== null

  useEffect(() => {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets))
  }, [customPresets])

  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      const panel = panelRef.current
      const anchorEl = floating && followPadId
        ? document.querySelector(`[data-pad-id="${CSS.escape(followPadId)}"]`)
        : buttonRef.current
      if (!panel || !anchorEl) return
      setPosition(
        computeAnchoredPosition(
          anchorEl.getBoundingClientRect(),
          { width: panel.offsetWidth, height: panel.offsetHeight },
          floating ? 'center' : 'left',
        ),
      )
    }
    reposition()
    window.addEventListener('resize', reposition)
    // 'scroll' doesn't bubble, but a capturing listener still sees it fire on
    // any scrollable ancestor (the pad grid lives inside .app-shell's own
    // scroll container, not the document) — see project.md's Scroll architecture.
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, floating, followPadId])

  const applyPreset = (preset: EffectPreset) => {
    dispatch({
      type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS',
      filter: preset.filter,
      grit: preset.grit,
      echo: preset.echo,
      reverb: preset.reverb,
    })
    for (const pad of visiblePads) {
      if (!engine.isPadLooping(pad.id)) continue
      for (const effectId of ['filter', 'grit', 'echo', 'reverb'] as const) {
        engine.updateLoopingPadEffect(pad.id, effectId, preset[effectId])
      }
    }
    setOpen(false)
  }

  const saveCurrentPreset = () => {
    const source = visiblePads[0]
    if (!source) return
    const name = window.prompt('Name this effects preset')?.trim()
    if (!name) return
    const value = (id: 'filter' | 'grit' | 'echo' | 'reverb') =>
      source.effects.find((effect) => effect.id === id)?.value ?? 0
    setCustomPresets((current) => [...current.filter((preset) => preset.name !== name), {
      name, filter: value('filter'), grit: value('grit'), echo: value('echo'), reverb: value('reverb'),
    }])
  }

  // The first visible pad stands in for "the grid's current value" — same
  // representative-pad approach saveCurrentPreset already uses. All visible
  // pads always carry the same character-dial values here (every write path
  // — presets, this live dial, an applied instrument's own remembered combo
  // — sets them identically across the grid), so any pad would do.
  const currentCharacterValue = (effectId: (typeof CHARACTER_EFFECT_IDS)[number]): number =>
    visiblePads[0]?.effects.find((effect) => effect.id === effectId)?.value ?? 0

  const handleDialChange = (effectId: EffectId, value: number) => {
    dispatch({ type: 'SET_ALL_PADS_EFFECT', effectId, value })
    for (const pad of visiblePads) {
      if (engine.isPadLooping(pad.id)) engine.updateLoopingPadEffect(pad.id, effectId, value)
    }
  }

  const toggleBypassAll = () => {
    const bypassed = !anyBypassed
    dispatch({ type: 'SET_ALL_PADS_EFFECTS_BYPASSED', bypassed })
    for (const pad of visiblePads) {
      if (engine.isPadLooping(pad.id)) {
        engine.updateLoopingPadEffectsBypass(pad.id, { ...pad, effectsBypassed: bypassed })
      }
    }
  }

  const resetAll = () => {
    dispatch({ type: 'RESET_ALL_PADS_EFFECTS' })
    for (const pad of visiblePads) {
      if (!engine.isPadLooping(pad.id)) continue
      for (const effectId of EFFECT_IDS) {
        engine.updateLoopingPadEffect(pad.id, effectId, NEUTRAL_EFFECT_VALUE)
      }
    }
    setOpen(false)
  }

  const panel = open && (
    <div
      ref={panelRef}
      className="fx-floating-panel"
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
      role="dialog"
      aria-label="Quick pad effects"
    >
      <div className="fx-floating-heading">
        <div className="fx-floating-heading-text">
          <span>Pad effects</span>
          <span className="muted">{visiblePads.length} pads</span>
        </div>
        <EffectsSwitch bypassed={anyBypassed} onToggle={toggleBypassAll} />
        {floating && (
          // Following the last-played pad can land the panel right over its
          // own toggle button (a pad near the header, or a tall panel
          // flipped upward) — a guaranteed close affordance inside the panel
          // itself means that never traps you unable to close it.
          <button
            type="button"
            className="fx-floating-close"
            onClick={() => setOpen(false)}
            aria-label="Close pad effects"
          >
            ✕
          </button>
        )}
      </div>
      <div className="fx-quick-presets">
        {allPresets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="fx-preset-button"
            onClick={() => applyPreset(preset)}
          >
            <EffectPreview preset={preset} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
      <div className="fx-custom-dials">
        {CHARACTER_EFFECT_IDS.map((effectId) => {
          const value = currentCharacterValue(effectId)
          return (
            <div className="dial-row fx-custom-dial-row" key={effectId}>
              <div className="dial-label-row">
                <label htmlFor={`fx-dial-${effectId}`} className="dial-label-text">
                  {CHARACTER_EFFECT_LABELS[effectId]}
                </label>
                <span className="dial-value">{formatDialValue(value)}</span>
              </div>
              <input
                id={`fx-dial-${effectId}`}
                type="range"
                className="dial-slider"
                min={EFFECT_MIN}
                max={EFFECT_MAX}
                step={EFFECT_STEP}
                value={value}
                disabled={visiblePads.length === 0}
                onChange={(event) => handleDialChange(effectId, Number(event.target.value))}
              />
            </div>
          )
        })}
      </div>
      <div className="fx-floating-actions">
        <button type="button" className="btn btn-secondary" onClick={saveCurrentPreset} disabled={visiblePads.length === 0}>
          Save preset
        </button>
        <button type="button" className="btn btn-secondary" onClick={resetAll}>
          Reset
        </button>
      </div>
    </div>
  )

  return (
    <div className="fx-popover-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={anyBypassed || anyCustomized ? 'fx-menu-btn on' : 'fx-menu-btn'}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Pad effects"
        title="Quick effects for all visible pads"
      >
        <FxIcon />
      </button>
      {panel && createPortal(panel, document.body)}
    </div>
  )
}

function EffectPreview({ preset }: { preset: EffectPreset }) {
  const values = [preset.filter, preset.grit, preset.echo, preset.reverb]
  return (
    <span className="effect-preview" aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} style={{ height: `${20 + Math.abs(value) * 0.55}%` }} />
      ))}
    </span>
  )
}

function FxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="7" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M7 3v2M7 11v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M17 11v2M17 19v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 16h6M15 8h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
