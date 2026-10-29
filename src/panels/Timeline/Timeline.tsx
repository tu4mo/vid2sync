import { Fragment, useCallback, useEffect, useRef } from 'react'

import {
  TRACK_KINDS,
  clipSpan,
  type Clips,
  type FadeSpan,
  type TimeRange,
  type TrackKind,
} from '../../lib/media'
import { snapTo } from '../../lib/time'
import { ClipView } from './ClipView'
import { useDrag } from './hooks/useDrag'
import { EDGE_PX, useTimelineScroll } from './hooks/useTimelineScroll'
import { ImportPrompt } from './ImportPrompt'
import { ROWS } from './layout'
import { Playhead } from './Playhead'
import { SyncLane } from './SyncLane'

const TAIL_SECONDS = 10
const SNAP_PX = 6
const DROP_WHAT: Record<TrackKind, string> = {
  video: 'a video file',
  audio: 'an audio file',
}
type Props = {
  clips: Clips
  muted: Record<TrackKind, boolean>
  volume: Record<TrackKind, number>
  selected: TrackKind | null
  time: number
  end: number
  pixelsPerSecond: number
  playing: boolean
  /** Scrolls to keep the playhead in view during playback. */
  followPlayhead: boolean
  onSelect: (kind: TrackKind | null) => void
  onOffsetChange: (kind: TrackKind, offset: number) => void
  onSeek: (t: number) => void
  /** Called with the timeline's length when playback reaches the end of it. */
  onReachEnd: (t: number) => void
  /** Moves the start or end of a clip's trimmed part to timeline time `t`. */
  onTrimChange: (kind: TrackKind, which: keyof TimeRange, t: number) => void
  /** Puts one end of a clip's trim back at the file's edge. */
  onTrimReset: (kind: TrackKind, which: keyof TimeRange) => void
  /** Sets a clip's fade-in (`start`) or fade-out (`end`). */
  onFadeChange: (
    kind: TrackKind,
    which: keyof TimeRange,
    span: FadeSpan,
  ) => void
  onToggleMute: (kind: TrackKind) => void
  onVolumeChange: (kind: TrackKind, volume: number) => void
  /** Imports each file onto the track its type belongs on. */
  onImport: (files: File[]) => void
  onRemove: (kind: TrackKind) => void
  onZoom: (pixelsPerSecond: number) => void
}

export function Timeline({
  clips,
  muted,
  volume,
  selected,
  time,
  end,
  pixelsPerSecond,
  playing,
  followPlayhead,
  onSelect,
  onOffsetChange,
  onSeek,
  onReachEnd,
  onTrimChange,
  onTrimReset,
  onFadeChange,
  onToggleMute,
  onVolumeChange,
  onImport,
  onRemove,
  onZoom,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const { scrollRef, onScroll, viewport, scrollLeft, scrubTo } =
    useTimelineScroll({
      time,
      playing,
      followPlayhead,
      pixelsPerSecond,
      onZoom,
    })

  function seekToPointer(clientX: number) {
    const rect = contentRef.current?.getBoundingClientRect()
    onSeek(
      scrubTo(Math.max(0, rect ? (clientX - rect.left) / pixelsPerSecond : 0)),
    )
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

  // Playing past the clips runs into empty timeline; stop at the end of it.
  useEffect(() => {
    if (playing && time >= visibleSeconds) {
      onReachEnd(visibleSeconds)
    }
  }, [playing, time, visibleSeconds, onReachEnd])

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
  // Read through a ref, so memoized clips don't re-render as the playhead moves.
  const snapTimesRef = useRef(snapTimes)
  const pixelsPerSecondRef = useRef(pixelsPerSecond)
  useEffect(() => {
    snapTimesRef.current = snapTimes
    pixelsPerSecondRef.current = pixelsPerSecond
  })
  const snap = useCallback(
    (t: number) =>
      snapTo(t, snapTimesRef.current, SNAP_PX / pixelsPerSecondRef.current),
    [],
  )

  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] bg-panel">
      {!clips.video && !clips.audio && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <ImportPrompt
            accept="video/*,audio/*"
            what="a video and an audio file"
            onImport={onImport}
          />
        </div>
      )}
      <div
        className="overflow-x-auto overflow-y-hidden overscroll-x-contain"
        style={{ paddingInline: EDGE_PX }}
        ref={scrollRef}
        onScroll={onScroll}
      >
        <div
          className="relative grid h-full min-w-full cursor-text"
          ref={contentRef}
          style={{ width, gridTemplateRows: ROWS }}
          {...scrub}
        >
          <div />

          {TRACK_KINDS.map((kind) => {
            const clip = clips[kind]
            return (
              <Fragment key={kind}>
                <div
                  className="relative flex items-center"
                  data-track={kind}
                  data-testid={`lane-${kind}`}
                >
                  {/* With both tracks empty, the timeline-wide prompt covers it. */}
                  {!clip && (clips.video || clips.audio) && (
                    // Kept to the scrolled-into-view part of the lane.
                    <div
                      className="pointer-events-none absolute inset-y-0 flex items-center justify-center"
                      style={{ left: scrollLeft - EDGE_PX, width: viewport }}
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
                      muted={muted[kind]}
                      volume={volume[kind]}
                      onSelect={onSelect}
                      onOffsetChange={onOffsetChange}
                      snap={snap}
                      onTrimChange={onTrimChange}
                      onTrimReset={onTrimReset}
                      onFadeChange={onFadeChange}
                      onToggleMute={onToggleMute}
                      onVolumeChange={onVolumeChange}
                      onRemove={onRemove}
                    />
                  )}
                </div>
                {kind === 'video' && (
                  <SyncLane
                    video={clips.video}
                    audio={clips.audio}
                    pixelsPerSecond={pixelsPerSecond}
                    view={{ start: scrollLeft - EDGE_PX, width: viewport }}
                    onOffsetChange={onOffsetChange}
                  />
                )}
              </Fragment>
            )
          })}
          <div />

          {(clips.video || clips.audio) && (
            <Playhead time={time} pixelsPerSecond={pixelsPerSecond} />
          )}
        </div>
      </div>
    </div>
  )
}
