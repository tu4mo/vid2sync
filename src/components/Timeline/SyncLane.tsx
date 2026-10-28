import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { Clip, TrackKind } from '../../media'

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
  onOffsetChange: (kind: TrackKind, offset: number) => void
}

/**
 * A rounded elbow from the video clip's start down to the audio clip's start, labelled with the gap between them.
 * Clicking the label lets you type the gap.
 */
export function SyncLane({ video, audio, pps, view, onOffsetChange }: Props) {
  const labelRef = useRef<HTMLDivElement>(null)
  const [labelWidth, setLabelWidth] = useState(0)
  const [editing, setEditing] = useState<{ draft: string; original: number } | null>(null)
  const cancelled = useRef(false)
  const delta = video && audio ? Math.round((audio.offset - video.offset) * 1000) : null
  // The field grows with its contents, so re-measure as you type.
  const draft = editing?.draft

  useLayoutEffect(() => {
    setLabelWidth(labelRef.current?.offsetWidth ?? 0)
  }, [delta, draft])

  if (!video || !audio || delta === null) {
    return <div className="border-b border-line" style={{ height: SYNC_LANE_HEIGHT }} />
  }

  // Moves the audio; if that would put it before 0:00, the video moves the other way instead.
  // Clamped to where the clips still overlap, which also keeps a typo from stretching the timeline to days.
  const setDelta = (ms: number) => {
    const clamped = Math.min(
      Math.max(ms, -Math.floor(audio.duration * 1000)),
      Math.floor(video.duration * 1000),
    )
    const target = video.offset + clamped / 1000
    if (target >= 0) {
      onOffsetChange('audio', target)
    } else {
      onOffsetChange('audio', 0)
      onOffsetChange('video', -clamped / 1000)
    }
    return clamped
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!editing) return
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancelled.current = true
      setDelta(editing.original)
      e.currentTarget.blur()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // Step live, so you can hear the change.
      e.preventDefault()
      const current = Number(editing.draft)
      const next =
        (Number.isFinite(current) ? Math.round(current) : delta) +
        (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
      setEditing({ ...editing, draft: String(setDelta(next)) })
    }
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
    <div
      className="pointer-events-none relative border-b border-line"
      style={{ height: SYNC_LANE_HEIGHT }}
    >
      {/* Each half is a box whose two borders draw one corner; +1 px so the far border lands on the clip's start. */}
      <div
        className={`absolute top-0 h-1/2 border-fg/60 ${down}`}
        style={{ left: Math.min(from, mid), width: Math.abs(mid - from) + 1 }}
      />
      <div
        className={`absolute top-[calc(50%-1px)] bottom-0 border-fg/60 ${up}`}
        style={{ left: Math.min(mid, to), width: Math.abs(to - mid) + 1 }}
      />
      <div
        ref={labelRef}
        className="pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded bg-panel px-1 text-2xs font-semibold text-accent tabular-nums"
        style={{ left: labelLeft }}
        // Keep the timeline from scrubbing (and deselecting) under the label.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {editing ? (
          <>
            <input
              className="field-sizing-content h-5 min-w-[4ch] rounded border border-accent bg-bg px-1 text-right outline-none not-supports-[field-sizing:content]:w-16"
              aria-label="Audio offset (ms)"
              inputMode="numeric"
              autoFocus
              value={editing.draft}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
              onKeyDown={onKeyDown}
              onBlur={() => {
                const ms = Number(editing.draft)
                if (!cancelled.current && editing.draft.trim() !== '' && Number.isFinite(ms))
                  setDelta(Math.round(ms))
                cancelled.current = false
                setEditing(null)
              }}
            />
            ms
          </>
        ) : (
          <button
            className="rounded-sm border-0 bg-transparent px-0.5 py-1 whitespace-nowrap [text-box:trim-both_cap_alphabetic] hover:underline"
            data-testid="sync"
            title={`Audio is ${Math.abs(delta)} ms ${delta >= 0 ? 'after' : 'before'} the video (click to edit)`}
            onClick={() => setEditing({ draft: String(delta), original: delta })}
          >
            {delta >= 0 ? '+' : ''}
            {delta} ms
          </button>
        )}
      </div>
    </div>
  )
}
