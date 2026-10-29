import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {
  TRACK_KINDS,
  clipSpan,
  type Clips,
  type FadeSpan,
  type TimeRange,
  type TrackKind,
} from '../../lib/media'
import { snapTo } from '../../lib/time'
import { clampZoom } from '../../lib/zoom'
import { ClipView } from './ClipView'
import { ROWS } from './layout'
import { Playhead } from './Playhead'
import { SyncLane } from './SyncLane'
import { useDrag } from './useDrag'

const TAIL_SECONDS = 10
const SNAP_PX = 6
// How far from the left edge a playhead scrolled back into view lands.
const REVEAL_MARGIN_PX = 40
/** Room before 0:00 and after the end, so clips don't run into the viewport's edges. */
const EDGE_PX = 16

type Props = {
  clips: Clips
  muted: Record<TrackKind, boolean>
  volume: Record<TrackKind, number>
  selected: TrackKind | null
  time: number
  end: number
  pixelsPerSecond: number
  playing: boolean
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null)
  const pixelsPerSecondRef = useRef(pixelsPerSecond)
  const [viewport, setViewport] = useState(800)
  const [scrollLeft, setScrollLeft] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    const observer = new ResizeObserver(() => setViewport(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the cursor.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    // oxlint-disable-next-line eslint/func-style -- a hoisted declaration would lose the null check above
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
      e.preventDefault()
      // Wheel events can outpace renders, so work from the zoom and scroll
      // the last event asked for, not what's been rendered yet.
      const current = pixelsPerSecondRef.current
      const next = clampZoom(current * Math.exp(-e.deltaY * 0.01))
      if (next === current) {
        return
      }
      const pending = zoomAnchor.current
      const from = pending
        ? Math.max(0, pending.t * current + EDGE_PX - pending.x)
        : el.scrollLeft
      const x = e.clientX - el.getBoundingClientRect().left
      zoomAnchor.current = { t: (from + x - EDGE_PX) / current, x }
      pixelsPerSecondRef.current = next
      onZoom(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoom])

  // Read through a ref, so the zoom effect doesn't rerun as the playhead moves.
  const timeRef = useRef(time)
  useEffect(() => {
    timeRef.current = time
  }, [time])

  // Sync the ref before paint, so the next wheel event can't pair the new
  // scroll position with the old zoom.
  useLayoutEffect(() => {
    const previous = pixelsPerSecondRef.current
    pixelsPerSecondRef.current = pixelsPerSecond
    const el = scrollRef.current
    if (!el) {
      return
    }
    // The wheel zooms around the cursor; the toolbar around the playhead,
    // pulled into view if it's scrolled off.
    const anchor = zoomAnchor.current ?? {
      t: timeRef.current,
      x: Math.min(
        el.clientWidth,
        Math.max(0, timeRef.current * previous + EDGE_PX - el.scrollLeft),
      ),
    }
    el.scrollLeft = anchor.t * pixelsPerSecond + EDGE_PX - anchor.x
    zoomAnchor.current = null
  }, [pixelsPerSecond])

  /** Scrolls time `t` into view, if it's off screen. */
  const reveal = useCallback(
    (t: number) => {
      const el = scrollRef.current
      const x = t * pixelsPerSecond + EDGE_PX
      if (
        el &&
        (x > el.scrollLeft + el.clientWidth - REVEAL_MARGIN_PX ||
          x < el.scrollLeft)
      ) {
        el.scrollLeft = x - REVEAL_MARGIN_PX
      }
    },
    [pixelsPerSecond],
  )

  // Keep the playhead in view during playback.
  useEffect(() => {
    if (playing) {
      reveal(time)
    }
  }, [time, playing, reveal])

  function seekToPointer(clientX: number) {
    const rect = contentRef.current?.getBoundingClientRect()
    onSeek(rect ? (clientX - rect.left) / pixelsPerSecond : 0)
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
  useEffect(() => {
    snapTimesRef.current = snapTimes
  })
  const snap = useCallback(
    (t: number) =>
      snapTo(t, snapTimesRef.current, SNAP_PX / pixelsPerSecondRef.current),
    [],
  )

  return (
    <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] bg-panel">
      {!clips.video && !clips.audio && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-dim">
          <span>
            <label className="pointer-events-auto cursor-pointer text-accent hover:underline">
              Import
              <input
                className="hidden"
                type="file"
                accept="video/*,audio/*"
                multiple
                onChange={(e) => {
                  onImport([...(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
            </label>{' '}
            or drop a video and an audio file
          </span>
        </div>
      )}
      <div
        className="overflow-x-auto overflow-y-hidden"
        style={{ paddingInline: EDGE_PX }}
        ref={scrollRef}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
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
