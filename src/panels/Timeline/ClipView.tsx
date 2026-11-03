import {
  clipFade,
  clipSpan,
  fadeClip,
  moveClip,
  trimClip,
  untrimClip,
  type Clip,
  type ClipEdit,
  type Edge,
  type TrackKind,
} from '../../lib/clip'
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
const TRIM_HANDLE_CLASSES: Record<Edge, string> = {
  start: 'left-0',
  end: 'right-0',
}

type TrimHandleProps = {
  which: Edge
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
  onEdit: (kind: TrackKind, edit: ClipEdit) => void
  /** Snaps a timeline time to nearby edges and the playhead. */
  snap: (t: number) => number
  /** The scrolled-into-view part of the lane, in px. */
  view: { start: number; width: number }
  onVolumeChange: (kind: TrackKind, volume: number) => void
  onRemove: (kind: TrackKind) => void
}

export function ClipView({
  kind,
  clip,
  pixelsPerSecond,
  selected,
  volume,
  onSelect,
  onEdit,
  snap,
  view,
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
      // Unclamped (moveClip clamps at 0:00), so after pushing past 0:00 the clip waits for the pointer to come back to it.
      d.offset += dx / pixelsPerSecond
      const offset = d.offset
      onEdit(kind, (c) => moveClip(c, offset))
    },
  )
  const span = clipSpan(clip)
  const fade = clipFade(clip)
  const left = span.start * pixelsPerSecond
  const width = (span.end - span.start) * pixelsPerSecond
  // The waveform covers only the clip around the screen, so its canvas stays a few screens wide
  // however far it's zoomed. It reaches at least half a screen past both edges, so a fast scroll
  // doesn't outrun it, and moves in half-screen steps, so it isn't redrawn on every scroll. Its
  // edges are on whole lane pixels, so it isn't drawn between them.
  const step = Math.max(1, view.width / 2)
  const drawnStart = Math.floor(view.start / step) * step - step
  const drawnEnd = drawnStart + view.width + 3 * step
  const waveStart = Math.floor(Math.max(left, drawnStart))
  const waveEnd = Math.ceil(Math.min(left + width, drawnEnd))

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
      style={{ left, width }}
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
          // Kept mounted while scrolled off, so it doesn't have to measure its height again.
          <Waveform
            peaks={clip.peaks}
            startTime={clip.trim.start + (waveStart - left) / pixelsPerSecond}
            pixelsPerSecond={pixelsPerSecond}
            left={waveStart - left}
            width={Math.max(0, waveEnd - waveStart)}
            color={WAVE_COLORS[kind]}
          />
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
          onChange={(w, next) => onEdit(kind, (c) => fadeClip(c, w, next))}
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
          onChange={(t) => onEdit(kind, (c) => trimClip(c, which, t))}
          onReset={() => onEdit(kind, (c) => untrimClip(c, which))}
        />
      ))}
    </div>
  )
}
