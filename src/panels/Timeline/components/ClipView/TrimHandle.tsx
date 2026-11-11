import type { Edge } from '../../../../lib/clip'
import { useDrag } from '../../hooks/useDrag'

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
export function TrimHandle({
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
