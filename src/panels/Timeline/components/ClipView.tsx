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
} from '../../../lib/clip'
import { useDrag } from '../hooks/useDrag'
import { volumeLevel } from '../lib/level'
import { Envelope } from './Envelope'
import { FadeHandle } from './FadeHandle'
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
  onVolumeChange: (kind: TrackKind, volume: number) => void
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
  onVolumeChange,
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

  return (
    <div
      // Isolated, so the z-indexes inside stay under the playhead. Not clipped, so the fade dots
      // can sit on the border; the box inside clips the rest.
      className={`group absolute inset-y-1 isolate cursor-grab touch-none rounded-md select-none active:cursor-grabbing ${
        // An overlay draws the border inside the clip, on top of the waveform.
        selected
          ? 'after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-md after:border-2 after:border-accent'
          : ''
      }`}
      data-testid={`clip-${kind}`}
      style={{ left, width }}
      {...drag}
    >
      <div
        className={`absolute inset-0 overflow-clip rounded-md ${CLIP_BACKGROUNDS[kind]}`}
      >
        {clip.peaks ? (
          // The whole file's waveform, shifted so the trimmed part shows.
          <div
            className="absolute inset-y-1"
            style={{ left: -clip.trim.start * pixelsPerSecond }}
          >
            <Waveform
              peaks={clip.peaks}
              pixelsPerSecond={pixelsPerSecond}
              color={WAVE_COLORS[kind]}
            />
          </div>
        ) : (
          <div className="absolute bottom-1 left-0 px-1.5 text-xs text-white/50">
            no audio track
          </div>
        )}
      </div>
      <Envelope
        fade={fade}
        volume={volume}
        width={width}
        pixelsPerSecond={pixelsPerSecond}
        onGrab={() => onSelect(kind)}
        onChange={(v) => onVolumeChange(kind, v)}
      />
      {(['start', 'end'] as const).map((which) => (
        <FadeHandle
          key={which}
          which={which}
          span={fade[which]}
          level={volumeLevel(volume)}
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
