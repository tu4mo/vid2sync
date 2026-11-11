import { useEffect, useRef } from 'react'

import { TRACK_KINDS, clipSpan, type Clips } from '../../../lib/clip'
import { SNAP_PX, snapTo } from '../../../lib/snap'

/**
 * Snaps a timeline time to the playhead, the clips' edges and the files' edges, when it's within
 * a few pixels of one at the current zoom.
 */
export function useSnap(clips: Clips, time: number, pixelsPerSecond: number) {
  const snapTimes = [
    time,
    ...TRACK_KINDS.flatMap((kind) => {
      const clip = clips[kind]
      if (!clip) {
        return []
      }
      const span = clipSpan(clip)
      return [span.start, span.end, clip.offset, clip.offset + clip.duration]
    }),
  ]
  // Read through refs, so `snap` keeps its identity and the clips don't re-render as the playhead
  // moves.
  const snapTimesRef = useRef(snapTimes)
  const pixelsPerSecondRef = useRef(pixelsPerSecond)
  useEffect(() => {
    snapTimesRef.current = snapTimes
    pixelsPerSecondRef.current = pixelsPerSecond
  })
  return function snap(candidate: number) {
    return snapTo(
      candidate,
      snapTimesRef.current,
      SNAP_PX / pixelsPerSecondRef.current,
    )
  }
}
