import { memo, useRef } from 'react'

import {
  clipSpan,
  type Clip,
  type TimeRange,
  type TrackKind,
} from '../../lib/media'
import { formatTime } from '../../lib/time'
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
const TRIM_HANDLE_CLASSES: Record<keyof TimeRange, string> = {
  start: 'left-0',
  end: 'right-0',
}

type ClipViewProps = {
  kind: TrackKind
  clip: Clip
  pixelsPerSecond: number
  selected: boolean
  muted: boolean
  onSelect: (kind: TrackKind) => void
  onOffsetChange: (kind: TrackKind, offset: number) => void
  /** Whether the clip's start and end can be dragged to trim it. */
  trimmable: boolean
  /** Snaps a timeline time to nearby edges and the playhead. */
  snap: (t: number) => number
  onTrimChange: (kind: TrackKind, which: keyof TimeRange, t: number) => void
  onTrimReset: (kind: TrackKind, which: keyof TimeRange) => void
}

export const ClipView = memo(function ClipView({
  kind,
  clip,
  pixelsPerSecond,
  selected,
  muted,
  onSelect,
  onOffsetChange,
  trimmable,
  snap,
  onTrimChange,
  onTrimReset,
}: ClipViewProps) {
  const drag = useRef<{ lastX: number; offset: number } | null>(null)
  // Where the pointer and the edge were when a trim handle was grabbed.
  const trimDrag = useRef<{ x: number; t: number } | null>(null)
  const span = clipSpan(clip)
  const width = (span.end - span.start) * pixelsPerSecond
  const fileWidth = clip.duration * pixelsPerSecond

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
      style={{ left: span.start * pixelsPerSecond, width }}
      onPointerDown={(e) => {
        if (e.button !== 0) {
          return
        }
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        onSelect(kind)
        drag.current = { lastX: e.clientX, offset: clip.offset }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) {
          return
        }
        // Shift slows the drag down 10× for fine alignment.
        const dx = (e.clientX - d.lastX) * (e.shiftKey ? 0.1 : 1)
        d.lastX = e.clientX
        // Unclamped, so after pushing past 0:00 the clip waits for the pointer to come back to it.
        d.offset += dx / pixelsPerSecond
        onOffsetChange(kind, Math.max(-clip.trim.start, d.offset))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="pointer-events-none sticky left-1 z-10 mt-1 ml-1 inline-block max-w-[calc(100%-0.5rem)] truncate rounded bg-black/60 px-1.5 py-0.5 text-2xs">
        {clip.file.name}{' '}
        <span className="text-white/60 tabular-nums">
          @ {formatTime(span.start)}
        </span>
      </div>
      {clip.peaks ? (
        // The whole file's waveform, shifted so the trimmed part shows.
        <div
          className="absolute inset-y-0"
          style={{ left: -clip.trim.start * pixelsPerSecond, width: fileWidth }}
        >
          <Waveform
            peaks={clip.peaks}
            duration={clip.duration}
            width={fileWidth}
            color={WAVE_COLORS[kind]}
          />
        </div>
      ) : (
        <div className="px-1.5 py-1 text-2xs text-white/50">no audio track</div>
      )}
      {trimmable &&
        (['start', 'end'] as const).map((which) => (
          <div
            key={which}
            className={`absolute inset-y-0 z-20 w-2 cursor-ew-resize ${TRIM_HANDLE_CLASSES[which]}`}
            title={`Trim the ${which} (drag, Shift to not snap; double-click to reset)`}
            data-testid={`trim-${which}`}
            data-time={span[which]}
            onPointerDown={(e) => {
              if (e.button !== 0) {
                return
              }
              // Keep the clip from moving, and the timeline from scrubbing.
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              onSelect(kind)
              trimDrag.current = { x: e.clientX, t: span[which] }
            }}
            onPointerMove={(e) => {
              const d = trimDrag.current
              if (!d) {
                return
              }
              const t = d.t + (e.clientX - d.x) / pixelsPerSecond
              onTrimChange(kind, which, e.shiftKey ? t : snap(t))
            }}
            onPointerUp={() => (trimDrag.current = null)}
            onPointerCancel={() => (trimDrag.current = null)}
            onDoubleClick={() => onTrimReset(kind, which)}
          />
        ))}
    </div>
  )
})
