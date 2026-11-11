import {
  clipFade,
  clipSpan,
  fadeClip,
  moveClip,
  trimClip,
  untrimClip,
  type Clip,
  type ClipEdit,
  type TrackKind,
} from '../../../../lib/clip'
import { SYNC_TRANSITION_MS } from '../../../../lib/layout'
import { useDrag } from '../../hooks/useDrag'
import { volumeLevel } from '../../lib/level'
import { Envelope } from './Envelope'
import { FadeHandle } from './FadeHandle'
import { Waveform } from './Waveform'
import { TrimHandle } from './TrimHandle'

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
  /** Glides into a new place rather than jumping. */
  gliding: boolean
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
  gliding,
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
      style={{
        left,
        width,
        transition: gliding
          ? `left ${SYNC_TRANSITION_MS}ms ease-out`
          : undefined,
      }}
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
