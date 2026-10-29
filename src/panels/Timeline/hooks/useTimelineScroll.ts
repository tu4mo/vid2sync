import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from 'react'

import { clampZoom } from '../../../lib/zoom'

// How far from the left edge a playhead scrolled back into view lands, and how close to the right
// edge it gets before following it during playback scrolls the timeline.
const REVEAL_MARGIN_PX = 40
/** Room before 0:00 and after the end, so clips don't run into the viewport's edges. */
export const EDGE_PX = 16

type Options = {
  time: number
  playing: boolean
  /** Scrolls to keep the playhead in view during playback. */
  followPlayhead: boolean
  pixelsPerSecond: number
  onZoom: (pixelsPerSecond: number) => void
}

/**
 * Scrolling for the timeline's scroll container: Ctrl/⌘ + wheel zoom, keeping the zoom anchored,
 * following the playhead during playback, and bringing it into view after a seek while paused.
 */
export function useTimelineScroll({
  time,
  playing,
  followPlayhead,
  pixelsPerSecond,
  onZoom,
}: Options) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null)
  const pixelsPerSecondRef = useRef(pixelsPerSecond)
  const [viewport, setViewport] = useState(800)
  const [scrollLeft, setScrollLeft] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver(() => setViewport(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the cursor.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    // oxlint-disable-next-line eslint/func-style -- a hoisted declaration would lose the null check above
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
      e.preventDefault()
      // Wheel events can outpace renders, so work from the zoom and scroll
      // the last event asked for, not what's been rendered yet.
      const current = pixelsPerSecondRef.current
      const next = clampZoom(current * Math.exp(-e.deltaY * 0.01))
      if (next === current) {
        return
      }
      const pending = zoomAnchor.current
      const from = pending
        ? Math.max(0, pending.t * current + EDGE_PX - pending.x)
        : el.scrollLeft
      const x = e.clientX - el.getBoundingClientRect().left
      zoomAnchor.current = { t: (from + x - EDGE_PX) / current, x }
      pixelsPerSecondRef.current = next
      onZoom(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoom])

  // Read through a ref, so the zoom effect doesn't rerun as the playhead moves.
  const timeRef = useRef(time)
  useEffect(() => {
    timeRef.current = time
  }, [time])

  // Sync the ref before paint, so the next wheel event can't pair the new
  // scroll position with the old zoom.
  useLayoutEffect(() => {
    const previous = pixelsPerSecondRef.current
    pixelsPerSecondRef.current = pixelsPerSecond
    const el = scrollRef.current
    if (!el) {
      return
    }
    // The wheel zooms around the cursor; the toolbar around the playhead,
    // pulled into view if it's scrolled off.
    const anchor = zoomAnchor.current ?? {
      t: timeRef.current,
      x: Math.min(
        el.clientWidth,
        Math.max(0, timeRef.current * previous + EDGE_PX - el.scrollLeft),
      ),
    }
    el.scrollLeft = anchor.t * pixelsPerSecond + EDGE_PX - anchor.x
    zoomAnchor.current = null
  }, [pixelsPerSecond])

  /** Scrolls time `t` into view, if it's off screen. */
  const reveal = useCallback(
    (t: number) => {
      const el = scrollRef.current
      const x = t * pixelsPerSecond + EDGE_PX
      if (
        el &&
        (x > el.scrollLeft + el.clientWidth - REVEAL_MARGIN_PX ||
          x < el.scrollLeft)
      ) {
        el.scrollLeft = x - REVEAL_MARGIN_PX
      }
    },
    [pixelsPerSecond],
  )

  // Keep the playhead in view during playback: once it nears the right edge, scroll along with it,
  // so it stays put and the clips move instead.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing || !followPlayhead) {
      return
    }
    const x = time * pixelsPerSecond + EDGE_PX
    const right = el.scrollLeft + el.clientWidth
    if (x > right - REVEAL_MARGIN_PX && x <= right) {
      el.scrollLeft = x - el.clientWidth + REVEAL_MARGIN_PX
    } else {
      reveal(time)
    }
  }, [time, playing, followPlayhead, pixelsPerSecond, reveal])

  // Where scrubbing last put the playhead. It's under the pointer, so there's nothing to reveal.
  const scrubbedTo = useRef<number | null>(null)

  // Bring the playhead into view when a seek while paused (Home, the arrow keys) moves it off
  // screen. Only on a move, so pausing or zooming doesn't scroll back to it.
  const pausedTime = useRef(time)
  useEffect(() => {
    if (playing || time === pausedTime.current) {
      pausedTime.current = time
      return
    }
    pausedTime.current = time
    if (time !== scrubbedTo.current) {
      reveal(time)
    }
  }, [time, playing, reveal])

  return {
    /** For the scroll container. */
    scrollRef,
    /** For the scroll container. */
    onScroll: (e: UIEvent<HTMLElement>) =>
      setScrollLeft(e.currentTarget.scrollLeft),
    /** The scroll container's width. */
    viewport,
    scrollLeft,
    /** Marks a seek to `t` as coming from the pointer, so the view doesn't scroll for it. Returns `t`. */
    scrubTo(t: number) {
      scrubbedTo.current = t
      return t
    },
  }
}
