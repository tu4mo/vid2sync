import { AudioWave01Icon, Video01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef } from 'react'

import {
  TRACK_KINDS,
  clipSpan,
  type ClipEdit,
  type Clips,
  type TrackKind,
  type Volumes,
} from '../../lib/clip'
import { snapTo } from '../../lib/snap'
import { ClipView } from './ClipView'
import { useDrag } from './hooks/useDrag'
import { useTimelineScroll } from './hooks/useTimelineScroll'
import { ImportPrompt } from './ImportPrompt'
import {
  EDGE_PX,
  ROWS,
  TRACK_ICON_INSET_PX,
  TRACK_ICON_WIDTH_PX,
} from './layout'
import { Playhead } from './Playhead'
import { SyncLane } from './SyncLane'

const TAIL_SECONDS = 10
const SNAP_PX = 6
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
      data-testid={`track-${kind}`}
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
  onSelect: (kind: TrackKind | null) => void
  /** Moves, trims or fades the clip on the `kind` track. */
  onEdit: (kind: TrackKind, edit: ClipEdit) => void
  onSeek: (t: number) => void
  /**
   * Called with the timeline's length when playback reaches the end of the empty timeline past
   * the clips. That only happens when it was started past them: running off the end of the clips
   * is stopped in `usePlayback`.
   */
  onPlayPastTimeline: (t: number) => void
  onVolumeChange: (kind: TrackKind, volume: number) => void
  /** Imports each file onto the track its type belongs on, or a single file onto `kind`. */
  onImport: (files: File[]) => void
  onRemove: (kind: TrackKind) => void
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
  onSelect,
  onEdit,
  onSeek,
  onPlayPastTimeline,
  onVolumeChange,
  onImport,
  onRemove,
  onZoom,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const { scrollRef, onScroll, viewport, scrollLeft, markScrub } =
    useTimelineScroll({
      time,
      playing,
      followPlayhead,
      pixelsPerSecond,
      onZoom,
    })

  function seekToPointer(clientX: number) {
    const rect = contentRef.current?.getBoundingClientRect()
    const t = Math.max(0, rect ? (clientX - rect.left) / pixelsPerSecond : 0)
    markScrub(t)
    onSeek(t)
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
    ...TRACK_KINDS.flatMap((k) => {
      const clip = clips[k]
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
  function snap(t: number) {
    return snapTo(t, snapTimesRef.current, SNAP_PX / pixelsPerSecondRef.current)
  }

  const hasClips = !!(clips.video || clips.audio)
  // The scrolled-into-view part of a lane, in px.
  const view = { start: scrollLeft - EDGE_PX, width: viewport }

  function lane(kind: TrackKind) {
    const clip = clips[kind]
    return (
      <div className="relative flex items-center" data-testid={`lane-${kind}`}>
        {/* With both tracks empty, the timeline-wide prompt covers it. */}
        {!clip && hasClips && (
          <div
            className="pointer-events-none absolute inset-y-0 flex items-center justify-center"
            style={{ left: view.start, width: view.width }}
          >
            <ImportPrompt
              accept={`${kind}/*`}
              what={DROP_WHAT[kind]}
              onImport={onImport}
            />
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
            view={view}
            onVolumeChange={onVolumeChange}
            onRemove={onRemove}
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] bg-panel">
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
        onScroll={onScroll}
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
            pixelsPerSecond={pixelsPerSecond}
            view={view}
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
  )
}
