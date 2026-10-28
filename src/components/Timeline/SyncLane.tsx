import { useLayoutEffect, useRef, useState } from 'react'
import type { Clip } from '../../media'

export const SYNC_LANE_HEIGHT = 26

const EDGE_GAP = 4

// Full class names, so Tailwind finds them in the source.
const ELBOW_CLASSES = {
  right: ['border-b border-l rounded-bl-sm', 'border-t border-r rounded-tr-sm'],
  left: ['border-b border-r rounded-br-sm', 'border-t border-l rounded-tl-sm'],
}

interface Props {
  video: Clip | null
  audio: Clip | null
  pps: number
  /** The scrolled-into-view part of the lane, in px. */
  view: { start: number; width: number }
}

/** A rounded elbow from the video clip's start down to the audio clip's start, labelled with the gap between them. */
export function SyncLane({ video, audio, pps, view }: Props) {
  const labelRef = useRef<HTMLSpanElement>(null)
  const [labelWidth, setLabelWidth] = useState(0)
  const delta = video && audio ? Math.round((audio.offset - video.offset) * 1000) : null

  useLayoutEffect(() => {
    setLabelWidth(labelRef.current?.offsetWidth ?? 0)
  }, [delta])

  if (!video || !audio || delta === null) {
    return <div className="border-b border-line" style={{ height: SYNC_LANE_HEIGHT }} />
  }

  const from = video.offset * pps
  const to = audio.offset * pps
  const mid = (from + to) / 2
  const width = Math.abs(to - from)
  const [down, up] = ELBOW_CLASSES[to >= from ? 'right' : 'left']
  // Centre the label on the line when it fits, otherwise park it just past the elbow.
  const preferred = width >= labelWidth + 20 ? mid - labelWidth / 2 : Math.max(from, to) + EDGE_GAP
  // Keep it on screen when the line is scrolled out of view.
  const labelLeft = Math.max(
    view.start + EDGE_GAP,
    Math.min(preferred, view.start + view.width - labelWidth - EDGE_GAP),
  )

  return (
    <div className="pointer-events-none relative border-b border-line" style={{ height: SYNC_LANE_HEIGHT }}>
      {/* Each half is a box whose two borders draw one corner; +1 px so the far border lands on the clip's start. */}
      <div
        className={`absolute top-0 h-1/2 border-fg/60 ${down}`}
        style={{ left: Math.min(from, mid), width: Math.abs(mid - from) + 1 }}
      />
      <div
        className={`absolute top-[calc(50%-1px)] bottom-0 border-fg/60 ${up}`}
        style={{ left: Math.min(mid, to), width: Math.abs(to - mid) + 1 }}
      />
      <span
        ref={labelRef}
        className="pointer-events-auto absolute top-1/2 -translate-y-1/2 rounded bg-panel px-1.5 text-2xs font-semibold whitespace-nowrap text-accent tabular-nums"
        style={{ left: labelLeft }}
        data-testid="sync"
        title={`Audio is ${Math.abs(delta)} ms ${delta >= 0 ? 'after' : 'before'} the video`}
      >
        {delta >= 0 ? '+' : ''}
        {delta} ms
      </span>
    </div>
  )
}
