import { useRef, useState } from 'react'

import {
  TRACK_KINDS,
  moveClip,
  syncClips,
  syncOffsetOf,
  type Clip,
  type ClipEdit,
  type TrackKind,
} from '../../../lib/clip'
import { EDGE_PX } from '../../../lib/layout'

const STEPS_BEFORE = [-5, -1]
const STEPS_AFTER = [1, 5]

type Props = {
  video: Clip | null
  audio: Clip | null
  /** The scroll viewport's width, in px. */
  viewport: number
  onEdit: (kind: TrackKind, edit: ClipEdit) => void
}

/**
 * Shows the sync offset (see `syncOffsetOf`), centred in the scrolled-into-view part of the lane. Trimming doesn't change it.
 * Clicking the label lets you type it, and the buttons either side of it step it by a few ms.
 */
export function SyncLane({ video, audio, viewport, onEdit }: Props) {
  const [editing, setEditing] = useState<{
    draft: string
    original: number
  } | null>(null)
  const cancelled = useRef(false)
  const syncOffset = syncOffsetOf({ video, audio })

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

  return (
    <div className="pointer-events-none relative">
      {/* Sticky, not placed from `scrollLeft`, which lags the scroll by a frame. The outer box spans the padding too, so the label centres in the whole viewport; sticky offsets count from inside the padding, so it's taken back off. */}
      <div
        className="absolute inset-y-0"
        style={{ left: -EDGE_PX, right: -EDGE_PX }}
      >
        <div
          className="sticky flex h-full items-center justify-center"
          style={{ left: -EDGE_PX, width: viewport }}
        >
          <div
            className="pointer-events-auto flex items-center gap-1 rounded-md bg-panel px-1 text-xs font-semibold text-accent tabular-nums"
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
                      step(
                        (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1),
                      )
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
                  setEditing({
                    draft: String(syncOffset),
                    original: syncOffset,
                  })
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
      </div>
    </div>
  )
}
