import { useLayoutEffect, useRef, useState } from 'react'

import {
  TRACK_KINDS,
  clipSpan,
  moveClip,
  syncClips,
  syncOffsetOf,
  type Clip,
  type ClipEdit,
  type TrackKind,
} from '../../../lib/clip'

const EDGE_GAP = 4
const STEPS_BEFORE = [-5, -1]
const STEPS_AFTER = [1, 5]

type Props = {
  video: Clip | null
  audio: Clip | null
  pixelsPerSecond: number
  /** The scrolled-into-view part of the lane, in px. */
  view: { start: number; width: number }
  onEdit: (kind: TrackKind, edit: ClipEdit) => void
}

/**
 * Shows the sync offset (see `syncOffsetOf`), centred under the video clip. Trimming doesn't change it.
 * Clicking the label lets you type it, and the buttons either side of it step it by a few ms.
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
  const syncOffset = syncOffsetOf({ video, audio })
  // The field grows with its contents, so re-measure as you type.
  const draft = editing?.draft

  useLayoutEffect(() => {
    setLabelWidth(labelRef.current?.offsetWidth ?? 0)
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the label's text changes with these, so they trigger the re-measure
  }, [syncOffset, draft])

  if (!video || !audio || syncOffset === null) {
    return <div />
  }

  /** Sets the sync offset, and returns it as clamped, for the field to show. */
  function applySync(target: number) {
    const current = { video, audio }
    const next = syncClips(current, target)
    // One edit per clip that moved: the audio, and the video when the audio can't go before 0:00.
    for (const kind of TRACK_KINDS) {
      const offset = next[kind]?.offset
      if (offset !== undefined && next[kind] !== current[kind]) {
        onEdit(kind, (c) => moveClip(c, offset))
      }
    }
    return syncOffsetOf(next) ?? target
  }

  /** Steps the sync offset by `ms` live, so you can hear the change, from what's typed if you're editing. */
  function step(ms: number) {
    if (!video || !audio || syncOffset === null) {
      return
    }
    const current = editing ? Number(editing.draft) : syncOffset
    const from = Number.isFinite(current) ? Math.round(current) : syncOffset
    const set = applySync(from + ms)
    if (editing) {
      setEditing({ ...editing, draft: String(set) })
    }
  }

  function stepButton(ms: number) {
    return (
      <button
        key={ms}
        type="button"
        className="h-4 cursor-pointer rounded px-1 text-dim tabular-nums hover:bg-panel-2 hover:text-accent"
        aria-label={`${ms > 0 ? 'Add' : 'Subtract'} ${Math.abs(ms)} ms`}
        data-testid={`sync-step-${ms}`}
        // Keep the field focused while editing, so the step doesn't commit it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => step(ms)}
      >
        {ms > 0 ? `+${ms}` : ms}
      </button>
    )
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
        className="pointer-events-auto absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md bg-panel px-1 text-xs font-semibold text-accent tabular-nums"
        style={{ left: labelLeft }}
        // Keep the timeline from scrubbing (and deselecting) under the label.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {STEPS_BEFORE.map(stepButton)}
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
                  applySync(editing.original)
                  e.currentTarget.blur()
                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  step((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))
                }
              }}
              onBlur={() => {
                const ms = Number(editing.draft)
                if (
                  !cancelled.current &&
                  editing.draft.trim() !== '' &&
                  Number.isFinite(ms)
                ) {
                  applySync(Math.round(ms))
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
              setEditing({ draft: String(syncOffset), original: syncOffset })
            }
          >
            {syncOffset === 0
              ? 'In sync'
              : `${Math.abs(syncOffset)} ms ${syncOffset > 0 ? 'ahead of' : 'behind'} audio`}
          </button>
        )}
        {STEPS_AFTER.map(stepButton)}
      </div>
    </div>
  )
}
