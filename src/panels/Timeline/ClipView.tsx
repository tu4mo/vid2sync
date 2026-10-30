import { memo } from 'react'

import {
  clipFade,
  clipSpan,
  type Clip,
  type FadeSpan,
  type TimeRange,
  type TrackKind,
} from '../../lib/media'
import { ClipToolbar } from './ClipToolbar'
import { FadeHandle } from './FadeHandle'
import { useDrag } from './hooks/useDrag'
import { Waveform } from './Waveform'

const WAVE_COLORS: Record<TrackKind, string> = {
  video: '#9cc4ff',
  audio: '#8ef0b8',
}
// Full class names, so Tailwind finds them in the source. Mixed into the panel colour rather than
// see-through, so the track icons don't show through the clips scrolling over them.
const CLIP_BACKGROUNDS: Record<TrackKind, string> = {
  video: 'bg-[color-mix(in_srgb,var(--color-video)_45%,var(--color-panel))]',
  audio: 'bg-[color-mix(in_srgb,var(--color-audio)_45%,var(--color-panel))]',
}
const TRIM_HANDLE_CLASSES: Record<keyof TimeRange, string> = {
  start: 'left-0',
  end: 'right-0',
}

type TrimHandleProps = {
  which: keyof TimeRange
  /** Where the edge is on the timeline. */
  time: number
  pixelsPerSecond: number
  snap: (t: number) => number
  onGrab: () => void
  onChange: (t: number) => void
  onReset: () => void
}

/** A clip edge that drags to trim it. */
function TrimHandle({
  which,
  time,
  pixelsPerSecond,
  snap,
  onGrab,
  onChange,
  onReset,
}: TrimHandleProps) {
  const drag = useDrag(
    (e) => {
      onGrab()
      // Where the pointer and the edge were when the handle was grabbed.
      return { x: e.clientX, t: time }
    },
    (e, d) => {
      const t = d.t + (e.clientX - d.x) / pixelsPerSecond
      onChange(e.shiftKey ? t : snap(t))
    },
  )

  return (
    <div
      className={`absolute inset-y-0 z-20 w-2 cursor-ew-resize ${TRIM_HANDLE_CLASSES[which]}`}
      title={`Trim the ${which} (drag, Shift to not snap; double-click to reset)`}
      data-testid={`trim-${which}`}
      data-time={time}
      {...drag}
      onDoubleClick={onReset}
    />
  )
}

type ClipViewProps = {
  kind: TrackKind
  clip: Clip
  pixelsPerSecond: number
  selected: boolean
  volume: number
  onSelect: (kind: TrackKind) => void
  onOffsetChange: (kind: TrackKind, offset: number) => void
  /** Snaps a timeline time to nearby edges and the playhead. */
  snap: (t: number) => number
  onTrimChange: (kind: TrackKind, which: keyof TimeRange, t: number) => void
  onTrimReset: (kind: TrackKind, which: keyof TimeRange) => void
  onFadeChange: (
    kind: TrackKind,
    which: keyof TimeRange,
    span: FadeSpan,
  ) => void
  onVolumeChange: (kind: TrackKind, volume: number) => void
  onRemove: (kind: TrackKind) => void
}

export const ClipView = memo(function ClipView({
  kind,
  clip,
  pixelsPerSecond,
  selected,
  volume,
  onSelect,
  onOffsetChange,
  snap,
  onTrimChange,
  onTrimReset,
  onFadeChange,
  onVolumeChange,
  onRemove,
}: ClipViewProps) {
  const drag = useDrag(
    (e) => {
      onSelect(kind)
      return { lastX: e.clientX, offset: clip.offset }
    },
    (e, d) => {
      // Shift slows the drag down 10× for fine alignment.
      const dx = (e.clientX - d.lastX) * (e.shiftKey ? 0.1 : 1)
      d.lastX = e.clientX
      // Unclamped (the setter clamps at 0:00), so after pushing past 0:00 the clip waits for the pointer to come back to it.
      d.offset += dx / pixelsPerSecond
      onOffsetChange(kind, d.offset)
    },
  )
  const span = clipSpan(clip)
  const fade = clipFade(clip)
  const width = (span.end - span.start) * pixelsPerSecond
  const fileWidth = clip.duration * pixelsPerSecond

  return (
    <div
      // Isolated, so the z-indexes inside stay under the playhead. Not clipped, so the fade dots
      // can sit on the border; the box inside clips the rest.
      className={`group absolute inset-y-1 isolate cursor-grab touch-none rounded-md select-none active:cursor-grabbing ${
        // An overlay draws the border inside the clip, on top of the waveform.
        selected
          ? 'after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-md after:border-2 after:border-accent'
          : ''
      } ${volume === 0 ? 'opacity-45' : ''}`}
      data-testid={`clip-${kind}`}
      style={{ left: span.start * pixelsPerSecond, width }}
      {...drag}
    >
      <div
        // Clip, not hidden: hidden would make this the scroll container the label sticks to.
        className={`absolute inset-0 overflow-clip rounded-md ${CLIP_BACKGROUNDS[kind]}`}
      >
        <ClipToolbar
          kind={kind}
          volume={volume}
          onVolumeChange={onVolumeChange}
          onRemove={onRemove}
        />
        {clip.peaks ? (
          // The whole file's waveform, shifted so the trimmed part shows.
          <div
            className="absolute inset-y-0"
            style={{
              left: -clip.trim.start * pixelsPerSecond,
              width: fileWidth,
            }}
          >
            <Waveform
              peaks={clip.peaks}
              duration={clip.duration}
              width={fileWidth}
              color={WAVE_COLORS[kind]}
            />
          </div>
        ) : (
          <div className="absolute bottom-1 left-0 px-1.5 text-2xs text-white/50">
            no audio track
          </div>
        )}
      </div>
      {(['start', 'end'] as const).map((which) => (
        <FadeHandle
          key={which}
          which={which}
          span={fade[which]}
          edge={span[which]}
          clipWidth={width}
          pixelsPerSecond={pixelsPerSecond}
          active={selected}
          snap={snap}
          onGrab={() => onSelect(kind)}
          onChange={(w, next) => onFadeChange(kind, w, next)}
        />
      ))}
      {(['start', 'end'] as const).map((which) => (
        <TrimHandle
          key={which}
          which={which}
          time={span[which]}
          pixelsPerSecond={pixelsPerSecond}
          snap={snap}
          onGrab={() => onSelect(kind)}
          onChange={(t) => onTrimChange(kind, which, t)}
          onReset={() => onTrimReset(kind, which)}
        />
      ))}
    </div>
  )
})
