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
  type TimeRange,
  type TrackKind,
} from '../../lib/media'
import { snapTo } from '../../lib/time'
import { ClipView } from './ClipView'
import { ROWS } from './layout'
import { Playhead } from './Playhead'
import { Ruler } from './Ruler'
import { SyncLane } from './SyncLane'
import { TrackHead } from './TrackHead'

export const MIN_PIXELS_PER_SECOND = 5
export const MAX_PIXELS_PER_SECOND = 2000

const TAIL_SECONDS = 10
const SNAP_PX = 6

type Props = {
  clips: Clips
  muted: Record<TrackKind, boolean>
  volume: Record<TrackKind, number>
  selected: TrackKind | null
  loading: TrackKind | null
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
  onToggleMute: (kind: TrackKind) => void
  onVolumeChange: (kind: TrackKind, volume: number) => void
  onImport: (file: File, kind: TrackKind) => void
  onRemove: (kind: TrackKind) => void
  onZoom: (pixelsPerSecond: number) => void
}

export function Timeline({
  clips,
  muted,
  volume,
  selected,
  loading,
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
  onToggleMute,
  onVolumeChange,
  onImport,
  onRemove,
  onZoom,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
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
      const next = Math.min(
        MAX_PIXELS_PER_SECOND,
        Math.max(MIN_PIXELS_PER_SECOND, current * Math.exp(-e.deltaY * 0.01)),
      )
      if (next === current) {
        return
      }
      const pending = zoomAnchor.current
      const from = pending
        ? Math.max(0, pending.t * current - pending.x)
        : el.scrollLeft
      const x = e.clientX - el.getBoundingClientRect().left
      zoomAnchor.current = { t: (from + x) / current, x }
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
        Math.max(0, timeRef.current * previous - el.scrollLeft),
      ),
    }
    el.scrollLeft = anchor.t * pixelsPerSecond - anchor.x
    zoomAnchor.current = null
  }, [pixelsPerSecond])

  // Keep the playhead in view during playback.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) {
      return
    }
    const x = time * pixelsPerSecond
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) {
      el.scrollLeft = x - 40
    }
  }, [time, pixelsPerSecond, playing])

  function timeAt(clientX: number) {
    const rect = contentRef.current?.getBoundingClientRect()
    return rect ? (clientX - rect.left) / pixelsPerSecond : 0
  }
  function seekToPointer(clientX: number) {
    onSeek(timeAt(clientX))
  }

  const visibleSeconds = Math.max(
    end + TAIL_SECONDS,
    viewport / pixelsPerSecond,
  )

  // Playing past the clips runs into empty timeline; stop at the end of it.
  useEffect(() => {
    if (playing && time >= visibleSeconds) {
      onReachEnd(visibleSeconds)
    }
  }, [playing, time, visibleSeconds, onReachEnd])

  const width = visibleSeconds * pixelsPerSecond
  // Trim edges snap to the playhead, the clips' edges and the files' edges.
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
    <div className="grid min-h-0 flex-1 grid-cols-[170px_minmax(0,1fr)] border-t border-line bg-panel">
      <div
        className="grid grid-cols-[minmax(0,1fr)] border-r border-line"
        style={{ gridTemplateRows: ROWS }}
      >
        <div className="border-b border-line" />
        {TRACK_KINDS.map((kind) => (
          <Fragment key={kind}>
            <TrackHead
              kind={kind}
              clip={clips[kind]}
              muted={muted[kind]}
              volume={volume[kind]}
              loading={loading === kind}
              onToggleMute={() => onToggleMute(kind)}
              onVolumeChange={(v) => onVolumeChange(kind, v)}
              onRemove={() => onRemove(kind)}
            />
            {kind === 'video' && (
              <div className="flex items-center border-b border-line px-3 text-2xs font-bold tracking-[0.08em] text-dim uppercase">
                {/* Trim to cap height so the caps, not the line box, are centred. */}
                <span className="[text-box:trim-both_cap_alphabetic]">
                  Sync
                </span>
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div
        className="overflow-x-auto overflow-y-hidden"
        ref={scrollRef}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <div
          className="relative grid h-full min-w-full cursor-text"
          ref={contentRef}
          style={{ width, gridTemplateRows: ROWS }}
          onPointerDown={(e) => {
            if (e.button !== 0) {
              return
            }
            e.currentTarget.setPointerCapture(e.pointerId)
            scrubbing.current = true
            onSelect(null)
            seekToPointer(e.clientX)
          }}
          onPointerMove={(e) => scrubbing.current && seekToPointer(e.clientX)}
          onPointerUp={() => (scrubbing.current = false)}
          onPointerCancel={() => (scrubbing.current = false)}
        >
          <Ruler pixelsPerSecond={pixelsPerSecond} seconds={visibleSeconds} />

          {TRACK_KINDS.map((kind) => {
            const clip = clips[kind]
            return (
              <Fragment key={kind}>
                <div
                  className="relative flex items-center border-b border-line"
                  data-track={kind}
                  data-testid={`lane-${kind}`}
                >
                  {clip ? (
                    <ClipView
                      kind={kind}
                      clip={clip}
                      pixelsPerSecond={pixelsPerSecond}
                      selected={selected === kind}
                      muted={muted[kind]}
                      onSelect={onSelect}
                      onOffsetChange={onOffsetChange}
                      // Only the video is trimmed; it's what gets exported.
                      trimmable={kind === 'video'}
                      snap={snap}
                      onTrimChange={onTrimChange}
                      onTrimReset={onTrimReset}
                    />
                  ) : (
                    <div className="sticky left-0 px-4 text-xs text-dim">
                      <label
                        className="cursor-pointer text-accent hover:underline"
                        // Keep the lane from scrubbing (and capturing the pointer, which eats the click).
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        Import
                        <input
                          className="hidden"
                          type="file"
                          accept={`${kind}/*`}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              onImport(file, kind)
                            }
                            e.target.value = ''
                          }}
                        />
                      </label>{' '}
                      or drop {kind === 'video' ? 'a video' : 'an audio'} file
                    </div>
                  )}
                </div>
                {kind === 'video' && (
                  <SyncLane
                    video={clips.video}
                    audio={clips.audio}
                    pixelsPerSecond={pixelsPerSecond}
                    view={{ start: scrollLeft, width: viewport }}
                    onOffsetChange={onOffsetChange}
                  />
                )}
              </Fragment>
            )
          })}

          <Playhead
            time={time}
            pixelsPerSecond={pixelsPerSecond}
            max={visibleSeconds}
            onSeek={(t) => {
              onSeek(t)
              // Bring a typed time into view.
              const el = scrollRef.current
              const x = t * pixelsPerSecond
              if (
                el &&
                (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft)
              ) {
                el.scrollLeft = x - 40
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
