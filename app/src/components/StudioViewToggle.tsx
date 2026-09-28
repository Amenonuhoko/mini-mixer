import { useIsLandscapeLayout } from '../hooks/useIsLandscapeLayout'
import { useIsWideScreen } from '../hooks/useIsWideScreen'
import { useNavigation, type StudioView } from '../state/NavigationContext'
import { ExpandIcon, SplitIcon } from './icons'

interface StudioViewToggleProps {
  panel: Exclude<StudioView, 'both'>
}

/**
 * In a panel's own header, on a screen that shows Pads and Seq together:
 * expand this panel to the whole window, or, once it has the window, bring
 * the other one back. A phone never shows it — there the pages are the tabs.
 */
export function StudioViewToggle({ panel }: StudioViewToggleProps) {
  const combinedView = useIsWideScreen() || useIsLandscapeLayout()
  const { studioView, setStudioView } = useNavigation()
  if (!combinedView) return null
  const alone = studioView === panel
  const name = panel === 'pads' ? 'pads' : 'sequencer'
  const other = panel === 'pads' ? 'sequencer' : 'pads'
  return (
    <button
      type="button"
      className={alone ? 'icon-btn studio-view-toggle on' : 'icon-btn studio-view-toggle'}
      onClick={() => setStudioView(alone ? 'both' : panel)}
      aria-pressed={alone}
      aria-label={alone ? `Show the ${other} again` : `Give the ${name} the whole window`}
      title={alone ? `Show the ${other} again` : `Give the ${name} the whole window`}
    >
      {alone ? <SplitIcon /> : <ExpandIcon />}
    </button>
  )
}
