import { useEffect, useRef } from 'react'

import { Spinner } from '../../components/Spinner/Spinner'
import type { ClipEdit, Clips, TrackKind, Volumes } from '../../lib/clip'
import { EDGE_PX, ROWS } from '../../lib/layout'
import { ImportPrompt } from './components/ImportPrompt'
import { Playhead } from './components/Playhead'
import { SyncLane } from './components/SyncLane'
import { TrackIcons } from './components/TrackIcons'
import { TrackLane } from './components/TrackLane'
import { useDrag } from './hooks/useDrag'
import { useSnap } from './hooks/useSnap'
import { useTimelineScroll } from './hooks/useTimelineScroll'

const TAIL_SECONDS = 10

type Props = {
  clips: Clips
  volume: Volumes
  selected: TrackKind | null
  time: number
  end: number
  /** The zoom level, 0–`MAX_ZOOM`. */
  zoom: number
  playing: boolean
  /** Scrolls to keep the playhead in view during playback. */
  followPlayhead: boolean
  /** Disables the timeline under a spinner while something runs that the clips mustn't change under. */
  disabled: boolean
  /** Glides the clips into new places rather than jumping, as when auto-sync moves them. */
  gliding: boolean
  onSelect: (kind: TrackKind | null) => void
  /** Moves, trims or fades the clip on the `kind` track. */
  onEdit: (kind: TrackKind, edit: ClipEdit) => void
  onSeek: (time: number) => void
  /**
   * Called with the timeline's length when playback reaches the end of the empty timeline past
   * the clips. That only happens when it was started past them: running off the end of the clips
   * is stopped in `usePlayback`.
   */
  onPlayPastTimeline: (timelineEnd: number) => void
  onVolumeChange: (kind: TrackKind, volume: number) => void
  /** Imports each file onto the track its type belongs on, or a single file onto `kind`. */
  onImport: (files: File[]) => void
  onZoom: (zoom: number) => void
}

export function Timeline({
  clips,
  volume,
  selected,
  time,
  end,
  zoom,
  playing,
  followPlayhead,
  disabled,
  gliding,
  onSelect,
  onEdit,
  onSeek,
  onPlayPastTimeline,
  onVolumeChange,
  onImport,
  onZoom,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const { scrollRef, viewport, pixelsPerSecond, markScrub } = useTimelineScroll(
    {
      time,
      playing,
      followPlayhead,
      zoom,
      onZoom,
    },
  )

  function seekToPointer(clientX: number) {
    const rect = contentRef.current?.getBoundingClientRect()
    const pointerTime = Math.max(
      0,
      rect ? (clientX - rect.left) / pixelsPerSecond : 0,
    )
    markScrub(pointerTime)
    onSeek(pointerTime)
  }

  const scrub = useDrag(
    (e) => {
      onSelect(null)
      seekToPointer(e.clientX)
    },
    (e) => seekToPointer(e.clientX),
  )

  const visibleSeconds = Math.max(
    end + TAIL_SECONDS,
    (viewport - 2 * EDGE_PX) / pixelsPerSecond,
  )

  // Playing past the clips runs into empty timeline; stop at the end of it. It's stopped here
  // because how much empty timeline there is depends on the viewport's width.
  useEffect(() => {
    if (playing && time >= visibleSeconds) {
      onPlayPastTimeline(visibleSeconds)
    }
  }, [playing, time, visibleSeconds, onPlayPastTimeline])

  const width = visibleSeconds * pixelsPerSecond
  const snap = useSnap(clips, time, pixelsPerSecond)

  const hasClips = !!(clips.video || clips.audio)
  // What both lanes take: each picks its own clip, selection and volume out of these.
  const laneProps = {
    clips,
    selected,
    volume,
    viewport,
    pixelsPerSecond,
    gliding,
    snap,
    onSelect,
    onEdit,
    onVolumeChange,
    onImport,
  }

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col"
      aria-label="Timeline"
      aria-busy={disabled}
      data-pixels-per-second={pixelsPerSecond}
    >
      {/* Inert while disabled, so nothing can be clicked, focused or tabbed to. Isolated, so nothing inside, however high its z-index, draws over the spinner. */}
      <div
        className="relative isolate grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] bg-panel"
        inert={disabled}
      >
        {!hasClips && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <ImportPrompt
              accept="video/*,audio/*"
              what="a video and an audio file"
              onImport={onImport}
            />
          </div>
        )}
        {/* The track icons, under the timeline, so the clips scroll over them. Not until there's a clip; before that the import prompt has the timeline to itself. */}
        {hasClips && <TrackIcons />}
        <div
          className="relative overflow-x-auto overflow-y-hidden overscroll-x-contain"
          style={{ paddingInline: EDGE_PX }}
          ref={scrollRef}
        >
          {/* The rows match ROWS: scrub strip, video, sync, audio, scrub strip. */}
          <div
            className="relative grid h-full min-w-full cursor-text"
            ref={contentRef}
            style={{ width, gridTemplateRows: ROWS }}
            {...scrub}
          >
            <div />
            <TrackLane kind="video" {...laneProps} />
            <SyncLane
              video={clips.video}
              audio={clips.audio}
              viewport={viewport}
              onEdit={onEdit}
            />
            <TrackLane kind="audio" {...laneProps} />
            <div />

            {hasClips && (
              <Playhead time={time} pixelsPerSecond={pixelsPerSecond} />
            )}
          </div>
        </div>
      </div>
      {disabled && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-panel/70"
          role="status"
          aria-label="Working"
        >
          <Spinner />
        </div>
      )}
    </section>
  )
}
