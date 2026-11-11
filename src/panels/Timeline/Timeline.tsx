import { AudioWave01Icon, Video01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef } from 'react'

import { Spinner } from '../../components/Spinner/Spinner'
import {
  TRACK_KINDS,
  clipSpan,
  type ClipEdit,
  type Clips,
  type TrackKind,
  type Volumes,
} from '../../lib/clip'
import {
  EDGE_PX,
  ROWS,
  TRACK_ICON_INSET_PX,
  TRACK_ICON_WIDTH_PX,
} from '../../lib/layout'
import { SNAP_PX, snapTo } from '../../lib/snap'
import { ClipView } from './components/ClipView/ClipView'
import { ImportPrompt } from './components/ImportPrompt'
import { Playhead } from './components/Playhead'
import { SyncLane } from './components/SyncLane'
import { useDrag } from './hooks/useDrag'
import { useTimelineScroll } from './hooks/useTimelineScroll'

const TAIL_SECONDS = 10
const DROP_WHAT: Record<TrackKind, string> = {
  video: 'a video file',
  audio: 'an audio file',
}
const LABELS: Record<TrackKind, string> = { video: 'Video', audio: 'Audio' }
const ICONS = { video: Video01Icon, audio: AudioWave01Icon }

/** A track's icon, at the start of its lane, under the clips. */
function TrackIcon({ kind }: { kind: TrackKind }) {
  return (
    <div
      className="flex items-center justify-center text-dim/50"
      style={{ marginLeft: TRACK_ICON_INSET_PX, width: TRACK_ICON_WIDTH_PX }}
      role="img"
      aria-label={LABELS[kind]}
    >
      <HugeiconsIcon icon={ICONS[kind]} size={24} />
    </div>
  )
}

type Props = {
  clips: Clips
  volume: Volumes
  selected: TrackKind | null
  time: number
  end: number
  pixelsPerSecond: number
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
  onZoom: (pixelsPerSecond: number) => void
}

export function Timeline({
  clips,
  volume,
  selected,
  time,
  end,
  pixelsPerSecond,
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
  const { scrollRef, viewport, markScrub } = useTimelineScroll({
    time,
    playing,
    followPlayhead,
    pixelsPerSecond,
    onZoom,
  })

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
  // Trim edges and fades snap to the playhead, the clips' edges and the files' edges.
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
  function snap(candidate: number) {
    return snapTo(
      candidate,
      snapTimesRef.current,
      SNAP_PX / pixelsPerSecondRef.current,
    )
  }

  const hasClips = !!(clips.video || clips.audio)

  function lane(kind: TrackKind) {
    const clip = clips[kind]
    return (
      <div className="relative flex items-center">
        {/* With both tracks empty, the timeline-wide prompt covers it. */}
        {/* Sticky, not placed from `scrollLeft`, which lags the scroll by a frame. The outer box spans the padding too, so the prompt starts at the viewport's edge; sticky offsets count from inside the padding, so it's taken back off. */}
        {!clip && hasClips && (
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: -EDGE_PX, right: -EDGE_PX }}
          >
            <div
              className="sticky flex h-full items-center justify-center"
              style={{ left: -EDGE_PX, width: viewport }}
            >
              <ImportPrompt
                accept={`${kind}/*`}
                what={DROP_WHAT[kind]}
                onImport={onImport}
              />
            </div>
          </div>
        )}
        {clip && (
          <ClipView
            kind={kind}
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            selected={selected === kind}
            volume={volume[kind]}
            onSelect={onSelect}
            onEdit={onEdit}
            snap={snap}
            gliding={gliding}
            onVolumeChange={onVolumeChange}
          />
        )}
      </div>
    )
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
        {hasClips && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 grid"
            style={{ gridTemplateRows: ROWS }}
          >
            <div />
            <TrackIcon kind="video" />
            <div />
            <TrackIcon kind="audio" />
            <div />
          </div>
        )}
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
            {lane('video')}
            <SyncLane
              video={clips.video}
              audio={clips.audio}
              viewport={viewport}
              onEdit={onEdit}
            />
            {lane('audio')}
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
