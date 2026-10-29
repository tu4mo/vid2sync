import { memo, useRef } from 'react'

import { formatTime, type Clip, type TrackKind } from '../../media'
import { Waveform } from './Waveform'

const WAVE_COLORS: Record<TrackKind, string> = {
  video: '#9cc4ff',
  audio: '#8ef0b8',
}
// Full class names, so Tailwind finds them in the source.
const CLIP_BACKGROUNDS: Record<TrackKind, string> = {
  video: 'bg-video/45',
  audio: 'bg-audio/45',
}

interface ClipViewProps {
  kind: TrackKind
  clip: Clip
  pixelsPerSecond: number
  selected: boolean
  muted: boolean
  onSelect: (kind: TrackKind) => void
  onOffsetChange: (kind: TrackKind, offset: number) => void
}

export const ClipView = memo(function ClipView(props: ClipViewProps) {
  const {
    kind,
    clip,
    pixelsPerSecond,
    selected,
    muted,
    onSelect,
    onOffsetChange,
  } = props
  const drag = useRef<{ lastX: number; offset: number } | null>(null)
  const width = clip.duration * pixelsPerSecond

  return (
    <div
      className={`absolute inset-y-1 cursor-grab touch-none overflow-hidden rounded-md active:cursor-grabbing ${
        CLIP_BACKGROUNDS[kind]
      } ${
        // An overlay draws the border inside the clip, on top of the waveform.
        selected
          ? 'after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:border-2 after:border-accent'
          : ''
      } ${muted ? 'opacity-45' : ''}`}
      data-testid={`clip-${kind}`}
      style={{ left: clip.offset * pixelsPerSecond, width }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        onSelect(kind)
        drag.current = { lastX: e.clientX, offset: clip.offset }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        // Shift slows the drag down 10× for fine alignment.
        const dx = (e.clientX - d.lastX) * (e.shiftKey ? 0.1 : 1)
        d.lastX = e.clientX
        d.offset = Math.max(0, d.offset + dx / pixelsPerSecond)
        onOffsetChange(kind, d.offset)
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="pointer-events-none sticky left-1 z-10 mt-1 ml-1 inline-block rounded bg-black/60 px-1.5 py-0.5 text-2xs whitespace-nowrap">
        {clip.file.name}{' '}
        <span className="text-white/60 tabular-nums">
          @ {formatTime(clip.offset)}
        </span>
      </div>
      {clip.peaks ? (
        <Waveform
          peaks={clip.peaks}
          duration={clip.duration}
          width={width}
          color={WAVE_COLORS[kind]}
        />
      ) : (
        <div className="px-1.5 py-1 text-2xs text-white/50">no audio track</div>
      )}
    </div>
  )
})
