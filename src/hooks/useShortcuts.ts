import { useEffect, useEffectEvent } from 'react'

import {
  moveClip,
  trimClip,
  untrimClip,
  type ClipEdit,
  type Clips,
  type TrackKind,
} from '../lib/clip'

// How far the arrow keys move a selected clip, and the playhead otherwise, in seconds (with Shift).
const NUDGE_CLIP = 0.01
const NUDGE_CLIP_SHIFT = 0.1
const NUDGE_PLAYHEAD = 1 / 30
const NUDGE_PLAYHEAD_SHIFT = 1

type Options = {
  /** False while something else has the keyboard, like the error dialog. */
  enabled: boolean
  clips: Clips
  selected: TrackKind | null
  time: number
  playing: boolean
  play: () => void
  pause: () => void
  seek: (time: number) => void
  onEdit: (kind: TrackKind, edit: ClipEdit) => void
  onSelect: (kind: TrackKind | null) => void
  onRemove: (kind: TrackKind) => void
}

/** The keyboard shortcuts: play/pause, nudging, trimming, selecting and removing clips. */
export function useShortcuts({
  enabled,
  clips,
  selected,
  time,
  playing,
  play,
  pause,
  seek,
  onEdit,
  onSelect,
  onRemove,
}: Options) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // Leave text fields and browser/OS shortcuts alone.
    if (
      !enabled ||
      e.target instanceof HTMLInputElement ||
      e.metaKey ||
      e.ctrlKey
    ) {
      return
    }
    // Trim keys act on the selected clip, or else the video.
    const trimTarget = selected ?? 'video'
    if (e.key === ' ') {
      e.preventDefault()
      if (playing) {
        pause()
      } else {
        play()
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const direction = e.key === 'ArrowLeft' ? -1 : 1
      if (selected && clips[selected]) {
        const step = e.shiftKey ? NUDGE_CLIP_SHIFT : NUDGE_CLIP
        onEdit(selected, (clip) =>
          moveClip(clip, clip.offset + direction * step),
        )
      } else {
        const step = e.shiftKey ? NUDGE_PLAYHEAD_SHIFT : NUDGE_PLAYHEAD
        seek(time + direction * step)
      }
    } else if (e.key === 'i') {
      onEdit(trimTarget, (clip) => trimClip(clip, 'start', time))
    } else if (e.key === 'o') {
      onEdit(trimTarget, (clip) => trimClip(clip, 'end', time))
    } else if (e.key === 'x') {
      onEdit(trimTarget, (clip) => untrimClip(clip))
    } else if (e.key === 'Home') {
      seek(0)
    } else if (e.key === 'Escape') {
      onSelect(null)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      onRemove(selected)
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
