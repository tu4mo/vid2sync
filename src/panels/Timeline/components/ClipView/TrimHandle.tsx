import { clsx } from 'clsx'

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
  snap: (time: number) => number
  onGrab: () => void
  onChange: (time: number) => void
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
      return { pointerX: e.clientX, time }
    },
    (e, dragState) => {
      const edgeTime =
        dragState.time + (e.clientX - dragState.pointerX) / pixelsPerSecond
      onChange(e.shiftKey ? edgeTime : snap(edgeTime))
    },
  )

  return (
    <div
      className={clsx(
        'absolute inset-y-0 z-20 w-2 cursor-ew-resize',
        TRIM_HANDLE_CLASSES[which],
      )}
      title={`Trim the ${which} (drag, Shift to not snap; double-click to reset)`}
      data-testid={`trim-${which}`}
      data-time={time}
      {...drag}
      onDoubleClick={onReset}
    />
  )
}
