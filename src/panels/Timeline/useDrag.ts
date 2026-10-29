import { useRef, type PointerEvent } from 'react'

/**
 * Pointer handlers for a drag with the primary button. `start` runs on press and returns
 * what the drag needs to remember (mutable, so a drag can track its own progress); `move`
 * gets it back on every move until the pointer is released. The press doesn't reach outer
 * drags, so a handle doesn't also move its clip or scrub the timeline.
 */
export function useDrag<T>(
  start: (e: PointerEvent<HTMLElement>) => T,
  move: (e: PointerEvent<HTMLElement>, state: T) => void,
) {
  const state = useRef<{ value: T } | null>(null)

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) {
        return
      }
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      state.current = { value: start(e) }
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      // A release can go missing (e.g. a native drag swallows it), so a move with no button held ends the drag.
      if (!(e.buttons & 1)) {
        state.current = null
      }
      if (state.current) {
        move(e, state.current.value)
      }
    },
    // Fires after pointerup and pointercancel, and when the browser drops the capture without either.
    onLostPointerCapture() {
      state.current = null
    },
  }
}
