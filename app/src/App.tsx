import { VariationDecision } from './components/VariationPanel'
import { useLayoutEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Library } from './components/Library'
import { LightShow } from './components/LightShow'
import { PadEditOverlay } from './components/PadEditOverlay'
import { PadsPage } from './components/PadsPage'
import { RecordingReviewOverlay } from './components/RecordingReviewOverlay'
import type { PendingRecording } from './components/RecordingReview'
import { Sequencer } from './components/Sequencer'
import { SettingsOverlay } from './components/SettingsOverlay'
import { SongArranger } from './components/SongArranger'
import { StyleDock } from './components/StyleBrowser'
import { TabBar } from './components/TabBar'
import { TransportStrip } from './components/TransportStrip'
import { useAutosave } from './hooks/useAutosave'
import { useBeatEngine } from './hooks/useBeatEngine'
import { useIsLandscapeLayout } from './hooks/useIsLandscapeLayout'
import { useIsWideScreen } from './hooks/useIsWideScreen'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import { EngineProvider, useEngine } from './state/EngineContext'
import { NavigationProvider, useNavigation } from './state/NavigationContext'

function EngineBridge({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAppState()
  const engine = useBeatEngine(state, dispatch)
  return <EngineProvider engine={engine}>{children}</EngineProvider>
}

/**
 * Above the wide-screen breakpoint, Pads and Sequencer are shown together
 * side by side instead of as separate pages — they're the two screens you go
 * back and forth between while actually playing/building a beat, unlike
 * Library, which stays a full-width page even when wide since it's more of
 * an occasional-visit browsing screen. The nav tabs still work as before;
 * on a wide screen, switching to either "Pads" or "Sequencer" shows both.
 *
 * A landscape phone or an ultra-wide/short desktop window (see
 * useIsLandscapeLayout) gets a different combined arrangement instead of
 * the side-by-side split: Sequencer on top, Pads below, both stretched to
 * the window's full width — a side-by-side column pair would otherwise
 * squeeze both down to an unhelpful sliver on a very wide-but-short window,
 * where the useful direction to spend the extra space is width within each
 * section, not another column. Landscape wins over the plain wide split
 * whenever both conditions happen to be true (an ultra-wide desktop window
 * is wide by either measure).
 */
interface CurrentPageProps {
  onBounced: (recording: PendingRecording) => void
}

function CurrentPage({ onBounced }: CurrentPageProps) {
  const { page } = useNavigation()
  const isWide = useIsWideScreen()
  const isLandscape = useIsLandscapeLayout()

  if (page === 'pads' || page === 'sequencer') {
    if (isLandscape) {
      return (
        <div className="landscape-stack">
          <Sequencer onBounced={onBounced} />
          <PadsPage onRecorded={onBounced} />
        </div>
      )
    }
    if (isWide) {
      return (
        <div className="wide-split">
          <PadsPage onRecorded={onBounced} />
          <Sequencer onBounced={onBounced} />
        </div>
      )
    }
  }

  switch (page) {
    case 'pads':
      return <PadsPage onRecorded={onBounced} />
    case 'sequencer':
      return <Sequencer onBounced={onBounced} />
    case 'song':
      return <SongArranger onBounced={onBounced} />
    case 'library':
      return <Library />
  }
}

function Shell() {
  const { state, dispatch } = useAppState()
  const { page, editingPadId, goBackFromEdit, goToPads, goToSequencer, stylesOpen } = useNavigation()
  const engine = useEngine()
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const swipeStart = useRef<{ x: number; y: number; identifier: number; startedAt: number } | null>(null)
  useAutosave(state, dispatch, engine)

  const isWide = useIsWideScreen()
  const isLandscape = useIsLandscapeLayout()
  // Either combined-view arrangement (side-by-side wide split, or the
  // landscape/ultra-wide stack) shows Pads and Sequencer together, so both
  // share the same "already showing both, no page to swipe to" treatment
  // below — only the mutually-exclusive layout choice itself (see
  // CurrentPage) actually distinguishes them.
  const combinedView = isWide || isLandscape

  // The bottom stack (Styles drawer, tab bar) changes
  // height as its parts come and go; the page and toasts sit right above it.
  useLayoutEffect(() => {
    const stack = bottomRef.current
    if (!stack) return
    const update = () => document.documentElement.style.setProperty('--bottom-h', `${stack.getBoundingClientRect().height}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stack)
    return () => observer.disconnect()
  }, [])

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (combinedView || (page !== 'pads' && page !== 'sequencer')) return
    // The pads, sequencer grid, and every control are performance/input
    // surfaces—not page-navigation handles. Their touches may bubble to this
    // shell, but they must never arm a page swipe.
    const origin = event.target instanceof Element ? event.target : null
    if (origin?.closest('button, input, select, textarea, a, [data-no-page-swipe], .pad-grid, .sequencer-scroll, .sequencer-grid')) {
      swipeStart.current = null
      return
    }
    if (event.touches.length !== 1) {
      swipeStart.current = null
      return
    }
    const touch = event.touches[0]
    if (touch) swipeStart.current = { x: touch.clientX, y: touch.clientY, identifier: touch.identifier, startedAt: Date.now() }
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || combinedView || (page !== 'pads' && page !== 'sequencer') || event.touches.length !== 0) return
    const touch = Array.from(event.changedTouches).find((candidate) => candidate.identifier === start.identifier)
    if (!touch) return
    const horizontalDistance = touch.clientX - start.x
    const verticalDistance = touch.clientY - start.y
    const elapsed = Date.now() - start.startedAt
    // Page changes are deliberately stricter than normal scrolling: one quick,
    // clearly horizontal 120px gesture. This keeps incidental pad drags,
    // diagonal scrolling, pinch attempts, and long presses in their own UI.
    if (
      elapsed > 700 ||
      Math.abs(horizontalDistance) < 120 ||
      Math.abs(horizontalDistance) < Math.abs(verticalDistance) * 2 ||
      Math.abs(verticalDistance) > 48
    ) return
    if (page === 'pads' && horizontalDistance < 0) goToSequencer()
    if (page === 'sequencer' && horizontalDistance > 0) goToPads()
  }

  return (
    <div className="device">
      <LightShow />
      <TransportStrip onOpenSettings={() => setSettingsOpen(true)} />
      <main
        className={[
          'app-shell',
          page === 'library' ? 'library-shell' : '',
          isLandscape && (page === 'pads' || page === 'sequencer') ? 'app-shell-landscape' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <VariationDecision />
        <CurrentPage onBounced={setPendingRecording} />
      </main>
      <div className="bottom-stack" ref={bottomRef}>
        {stylesOpen && <StyleDock />}
        <div className="bottom-row">
          <TabBar combinedView={combinedView} />
        </div>
      </div>
      {editingPadId !== null && <PadEditOverlay onClose={goBackFromEdit} />}
      {pendingRecording && (
        <RecordingReviewOverlay
          recording={pendingRecording}
          onDone={() => setPendingRecording(null)}
        />
      )}
      {settingsOpen && <SettingsOverlay onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function App() {
  return (
    <AppStateProvider>
      <EngineBridge>
        <NavigationProvider>
          <Shell />
        </NavigationProvider>
      </EngineBridge>
    </AppStateProvider>
  )
}

export default App
