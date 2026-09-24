import type { ReactNode } from 'react'

interface IconProps {
  size?: number
}

/** Every icon shares one 24-unit grid, one stroke weight, and currentColor — so a glyph always matches the control it sits in. */
function Svg({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5v14l12-7z" fill="currentColor" stroke="none" />
  </Svg>
)

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
  </Svg>
)

export const PanicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" />
    <rect x="9" y="9" width="6" height="6" rx="0.5" fill="currentColor" stroke="none" />
  </Svg>
)

export const LoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </Svg>
)

export const OnceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h13" />
    <path d="M13 7l5 5-5 5" />
    <path d="M20 5v14" />
  </Svg>
)

export const MetronomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3h6l3.5 18h-13z" />
    <path d="M12 16l5-9" />
  </Svg>
)

export const VolumeIcon = ({ muted, ...p }: IconProps & { muted?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
  </Svg>
)

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Svg>
)

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
)

/** The "record what's playing" source — a mix bus rather than a microphone. */
export const LiveIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
  </Svg>
)

export const PadsIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
)

export const SeqIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h3M9 6h3M15 6h6M3 12h6M12 12h3M18 12h3M3 18h9M15 18h3" />
  </Svg>
)

export const LibraryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4v16M8 4v16" />
    <path d="M12 5l3.6-1 4.4 16-3.6 1z" />
  </Svg>
)

export const FxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
)

export const ChevronIcon = ({ direction, ...p }: IconProps & { direction: 'left' | 'right' }) => (
  <Svg {...p}>
    <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </Svg>
)

export const SaveIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M4 16v3h16v-3" />
  </Svg>
)

export const OpenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 16v3h16v-3" />
  </Svg>
)

export const EyeIcon = ({ closed, ...p }: IconProps & { closed?: boolean }) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.5" />
    {closed && <path d="M4 20L20 4" />}
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />
  </Svg>
)

export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 20V14M5 10V4M12 20V12M12 8V4M19 20V16M19 12V4" />
    <path d="M3 14h4M10 8h4M17 16h4" />
  </Svg>
)

export const SwapIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </Svg>
)

export const MuteIcon = ({ muted, ...p }: IconProps & { muted?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    {muted ? <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" /> : <path d="M16.5 9a4.5 4.5 0 0 1 0 6" />}
  </Svg>
)

export const KeysIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M8 4v10M12 4v16M16 4v10" />
  </Svg>
)

export const MixIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4v16M12 4v16M18 4v16" />
    <rect x="4" y="13" width="4" height="3" rx="0.5" fill="currentColor" />
    <rect x="10" y="7" width="4" height="3" rx="0.5" fill="currentColor" />
    <rect x="16" y="11" width="4" height="3" rx="0.5" fill="currentColor" />
  </Svg>
)

export const HitIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
  </Svg>
)

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />
  </Svg>
)

export const BrushIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4.5l5 5L11 18l-5-5z" />
    <path d="M6 13c-2 .5-3 2-3 4.5 0 1 .5 2.5 2.5 2.5 2.5 0 4-1 4.5-3" />
  </Svg>
)

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
  </Svg>
)

export const DiceIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r="0.9" fill="currentColor" />
    <circle cx="15" cy="15" r="0.9" fill="currentColor" />
    <circle cx="15" cy="9" r="0.9" fill="currentColor" />
    <circle cx="9" cy="15" r="0.9" fill="currentColor" />
  </Svg>
)

export const RecordDotIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
  </Svg>
)
