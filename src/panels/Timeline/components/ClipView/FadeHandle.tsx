import type { Edge, FadeSpan } from '../../../../lib/clip'
import { useDrag } from '../../hooks/useDrag'
import { ENVELOPE_INSET_PX, levelTop } from '../../lib/level'

// The side of the clip each fade sits on.
const SIDES = { start: 'left', end: 'right' } as const

const LABELS: Record<Edge, string> = {
  start: 'Fade in',
  end: 'Fade out',
}
const SILENT_LABELS: Record<Edge, string> = {
  start: 'Where the fade in starts',
  end: 'Where the fade out ends',
}

type DotProps = {
  which: Edge
  /** The top dot sets where the fade reaches the volume line, the bottom one where it stops being silent. */
  point: keyof FadeSpan
  /** How far in from the clip edge the dot sits, in seconds. */
  distance: number
  /** The volume line's height (0 to 1), which the top dot rides. */
  level: number
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
  level,
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
  const side = SIDES[which]
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
    Math.max(distance * pixelsPerSecond, ENVELOPE_INSET_PX),
    clipWidth - ENVELOPE_INSET_PX,
  )

  return (
    <div
      className={`absolute z-30 flex size-4 cursor-ew-resize items-center justify-center transition-opacity ${
        active ? '' : 'opacity-0 group-hover:opacity-100'
      }`}
      style={{
        [side]: x,
        // The top dot rides the volume line; the bottom one sits at silence, on the 2px border.
        top: levelTop(point === 'full' ? level : 0),
        translate: `${which === 'start' ? '-50%' : '50%'} -50%`,
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
  which: Edge
  span: FadeSpan
  /** The volume line's height (0 to 1), which the top dot rides. */
  level: number
  /** The clip edge the fade runs from, on the timeline. */
  edge: number
  clipWidth: number
  pixelsPerSecond: number
  /** Shows the dots even when the pointer isn't over the clip. */
  active: boolean
  snap: (t: number) => number
  onGrab: () => void
  onChange: (which: Edge, span: FadeSpan) => void
}

/**
 * A fade's dots: one on the volume line that drags where the fade reaches it and, once there's
 * a fade, one at the bottom that drags where it starts being silent. The envelope draws the ramp.
 */
export function FadeHandle({
  which,
  span,
  level,
  edge,
  clipWidth,
  pixelsPerSecond,
  active,
  snap,
  onGrab,
  onChange,
}: Props) {
  const dot = {
    which,
    level,
    edge,
    clipWidth,
    pixelsPerSecond,
    active,
    snap,
    onGrab,
  }

  return (
    <>
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
