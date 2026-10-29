import { fadeGain } from '../../lib/fade'
import type { FadeSpan, TimeRange } from '../../lib/media'
import { useDrag } from './hooks/useDrag'

const CURVE_POINTS = 32
// Puts the dot on the border's corner when there's no fade, centered on the 2px border like it is vertically.
const DOT_INSET_PX = 1

const LABELS: Record<keyof TimeRange, string> = {
  start: 'Fade in',
  end: 'Fade out',
}
const SILENT_LABELS: Record<keyof TimeRange, string> = {
  start: 'Where the fade in starts',
  end: 'Where the fade out ends',
}

/**
 * The ramp across a 1×1 box, as path points from left to right. `silent` is the share of the
 * box that's silent: on the left for a fade-in, on the right for a fade-out.
 */
function rampPoints(which: keyof TimeRange, silent: number): string {
  return Array.from({ length: CURVE_POINTS + 1 }, (_, i) => {
    const p = i / CURVE_POINTS
    return which === 'start'
      ? `${silent + p * (1 - silent)},${1 - fadeGain(p)}`
      : `${p * (1 - silent)},${1 - fadeGain(1 - p)}`
  }).join(' L')
}

/** The shade above the ramp, covering the silence too. */
function shadePath(which: keyof TimeRange, silent: number): string {
  const ramp = rampPoints(which, silent)
  return which === 'start'
    ? `M0,0 L0,1 L${ramp} Z`
    : `M0,0 L${ramp} L1,1 L1,0 Z`
}

type DotProps = {
  which: keyof TimeRange
  /** The top dot sets where the fade is at full volume, the bottom one where it stops being silent. */
  point: keyof FadeSpan
  /** How far in from the clip edge the dot sits, in seconds. */
  distance: number
  edge: number
  clipWidth: number
  pixelsPerSecond: number
  active: boolean
  snap: (t: number) => number
  title: string
  onGrab: () => void
  onMove: (distance: number) => void
  onReset: () => void
}

/** A dot that drags one of a fade's points along the clip. */
function Dot({
  which,
  point,
  distance,
  edge,
  clipWidth,
  pixelsPerSecond,
  active,
  snap,
  title,
  onGrab,
  onMove,
  onReset,
}: DotProps) {
  const drag = useDrag(
    (e) => {
      onGrab()
      // Where the pointer was and how far in the dot was when it was grabbed.
      return { x: e.clientX, distance }
    },
    (e, d) => {
      // Inward is right for a fade-in and left for a fade-out.
      const dir = which === 'start' ? 1 : -1
      const t = edge + dir * d.distance + (e.clientX - d.x) / pixelsPerSecond
      onMove(dir * ((e.shiftKey ? t : snap(t)) - edge))
    },
  )
  const x = Math.min(
    Math.max(distance * pixelsPerSecond, DOT_INSET_PX),
    clipWidth - DOT_INSET_PX,
  )

  return (
    <div
      className={`absolute z-30 flex size-4 cursor-ew-resize items-center justify-center transition-opacity ${
        // Centered on the 2px border.
        point === 'full' ? 'top-px' : 'bottom-px'
      } ${active ? '' : 'opacity-0 group-hover:opacity-100'}`}
      style={{
        [which === 'start' ? 'left' : 'right']: x,
        translate: `${which === 'start' ? '-50%' : '50%'} ${point === 'full' ? '-50%' : '50%'}`,
      }}
      title={title}
      data-testid={`fade-${which}${point === 'silent' ? '-silent' : ''}`}
      data-distance={distance}
      {...drag}
      onDoubleClick={onReset}
    >
      <div className="size-2.5 rounded-full bg-white shadow" />
    </div>
  )
}

type Props = {
  which: keyof TimeRange
  span: FadeSpan
  /** The clip edge the fade runs from, on the timeline. */
  edge: number
  clipWidth: number
  pixelsPerSecond: number
  /** Shows the dots even when the pointer isn't over the clip. */
  active: boolean
  snap: (t: number) => number
  onGrab: () => void
  onChange: (which: keyof TimeRange, span: FadeSpan) => void
}

/**
 * A fade's ramp over the clip, with a dot at the top that drags where it reaches full volume
 * and, once there's a fade, one at the bottom that drags where it starts being silent.
 */
export function FadeHandle({
  which,
  span,
  edge,
  clipWidth,
  pixelsPerSecond,
  active,
  snap,
  onGrab,
  onChange,
}: Props) {
  const dot = { which, edge, clipWidth, pixelsPerSecond, active, snap, onGrab }
  // The share of the fade that's silent.
  const silentShare = span.full > 0 ? span.silent / span.full : 0

  return (
    <>
      {span.full > 0 && (
        <svg
          // Rounded like the clip's corners, since the clip no longer clips it.
          className={`pointer-events-none absolute inset-y-0 z-10 h-full ${
            which === 'start' ? 'rounded-l-md' : 'rounded-r-md'
          }`}
          style={{
            [which === 'start' ? 'left' : 'right']: 0,
            width: span.full * pixelsPerSecond,
          }}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {/* The shade, then the line along the ramp alone. */}
          <path d={shadePath(which, silentShare)} className="fill-black/35" />
          <path
            d={`M${rampPoints(which, silentShare)}`}
            className="fill-none stroke-white/80"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <Dot
        {...dot}
        point="full"
        distance={span.full}
        title={`${LABELS[which]} (drag, Shift to not snap; double-click to clear)`}
        onMove={(full) => onChange(which, { ...span, full })}
        onReset={() => onChange(which, { silent: 0, full: 0 })}
      />
      {span.full > 0 && (
        <Dot
          {...dot}
          point="silent"
          distance={span.silent}
          title={`${SILENT_LABELS[which]}, silent toward the edge (drag, Shift to not snap; double-click to put it at the edge)`}
          onMove={(silent) => onChange(which, { ...span, silent })}
          onReset={() => onChange(which, { ...span, silent: 0 })}
        />
      )}
    </>
  )
}
