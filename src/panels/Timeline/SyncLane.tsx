import { useLayoutEffect, useRef, useState } from 'react'

import {
  clipSpan,
  moveClip,
  syncTo,
  type Clip,
  type ClipEdit,
  type Sync,
  type TrackKind,
} from '../../lib/clip'

const EDGE_GAP = 4

type Props = {
  video: Clip | null
  audio: Clip | null
  pixelsPerSecond: number
  /** The scrolled-into-view part of the lane, in px. */
  view: { start: number; width: number }
  onEdit: (kind: TrackKind, edit: ClipEdit) => void
}

/**
 * The gap between the video file's start and the audio file's start (trimming doesn't change the sync),
 * centred under the video clip.
 * Clicking the label lets you type the gap.
 */
export function SyncLane({
  video,
  audio,
  pixelsPerSecond,
  view,
  onEdit,
}: Props) {
  const labelRef = useRef<HTMLDivElement>(null)
  const [labelWidth, setLabelWidth] = useState(0)
  const [editing, setEditing] = useState<{
    draft: string
    original: number
  } | null>(null)
  const cancelled = useRef(false)
  const delta =
    video && audio ? Math.round((audio.offset - video.offset) * 1000) : null
  // The field grows with its contents, so re-measure as you type.
  const draft = editing?.draft

  useLayoutEffect(() => {
    setLabelWidth(labelRef.current?.offsetWidth ?? 0)
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the label's text changes with these, so they trigger the re-measure
  }, [delta, draft])

  if (!video || !audio || delta === null) {
    return <div />
  }

  function applySync(sync: Sync) {
    onEdit('audio', (c) => moveClip(c, sync.audio))
    const videoOffset = sync.video
    if (videoOffset !== undefined) {
      onEdit('video', (c) => moveClip(c, videoOffset))
    }
    return sync.delta
  }

  const span = clipSpan(video)
  const preferred =
    ((span.start + span.end) / 2) * pixelsPerSecond - labelWidth / 2
  // Keep it on screen when the clip's middle is scrolled out of view.
  const labelLeft = Math.max(
    view.start + EDGE_GAP,
    Math.min(preferred, view.start + view.width - labelWidth - EDGE_GAP),
  )

  return (
    <div className="pointer-events-none relative">
      <div
        ref={labelRef}
        className="pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-panel px-1 text-2xs font-semibold text-accent tabular-nums"
        style={{ left: labelLeft }}
        // Keep the timeline from scrubbing (and deselecting) under the label.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {editing ? (
          <>
            <input
              className="field-sizing-content h-5 min-w-[4ch] rounded-md border border-accent bg-bg px-1 text-right outline-none not-supports-[field-sizing:content]:w-16"
              aria-label="Audio offset (ms)"
              inputMode="numeric"
              autoFocus
              value={editing.draft}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) =>
                setEditing({ ...editing, draft: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                } else if (e.key === 'Escape') {
                  cancelled.current = true
                  applySync(syncTo(video, audio, editing.original))
                  e.currentTarget.blur()
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  // Step live, so you can hear the change.
                  e.preventDefault()
                  const current = Number(editing.draft)
                  const next =
                    (Number.isFinite(current) ? Math.round(current) : delta) +
                    (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
                  const set = applySync(syncTo(video, audio, next))
                  setEditing({ ...editing, draft: String(set) })
                }
              }}
              onBlur={() => {
                const ms = Number(editing.draft)
                if (
                  !cancelled.current &&
                  editing.draft.trim() !== '' &&
                  Number.isFinite(ms)
                ) {
                  applySync(syncTo(video, audio, Math.round(ms)))
                }
                cancelled.current = false
                setEditing(null)
              }}
            />
            ms
          </>
        ) : (
          <button
            type="button"
            className="cursor-pointer rounded-md px-0.5 py-1 whitespace-nowrap [text-box:trim-both_cap_alphabetic] hover:underline"
            data-testid="sync"
            title="Click to edit in ms (positive puts the video ahead of the audio)"
            onClick={() =>
              setEditing({ draft: String(delta), original: delta })
            }
          >
            {delta === 0
              ? 'In sync'
              : `${Math.abs(delta)} ms ${delta > 0 ? 'ahead of' : 'behind'} audio`}
          </button>
        )}
      </div>
    </div>
  )
}
