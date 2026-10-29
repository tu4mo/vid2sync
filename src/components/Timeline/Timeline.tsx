import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { TRACK_KINDS, type Clips, type TimeRange, type TrackKind } from '../../media'
import { ClipView } from './ClipView'
import { LANE_HEIGHT, SYNC_LANE_HEIGHT } from './layout'
import { Playhead } from './Playhead'
import { Ruler } from './Ruler'
import { SyncLane } from './SyncLane'
import { TrackHead } from './TrackHead'

export const MIN_PIXELS_PER_SECOND = 5
export const MAX_PIXELS_PER_SECOND = 2000

const TAIL_SECONDS = 10

interface Props {
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
  /** The export range, or null when there's no video. */
  range: TimeRange | null
  onRangeChange: (which: keyof TimeRange, t: number) => void
  onRangeReset: (which?: keyof TimeRange) => void
  onToggleMute: (kind: TrackKind) => void
  onVolumeChange: (kind: TrackKind, volume: number) => void
  onImport: (file: File, kind: TrackKind) => void
  onRemove: (kind: TrackKind) => void
  onZoom: (pixelsPerSecond: number) => void
}

export function Timeline(props: Props) {
  const { clips, time, end, pixelsPerSecond, playing, range, onSeek, onSelect, onZoom } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null)
  const pixelsPerSecondRef = useRef(pixelsPerSecond)
  const [viewport, setViewport] = useState(800)
  const [scrollLeft, setScrollLeft] = useState(0)

  useEffect(() => {
    pixelsPerSecondRef.current = pixelsPerSecond
  }, [pixelsPerSecond])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewport(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the cursor.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const current = pixelsPerSecondRef.current
      const next = Math.min(
        MAX_PIXELS_PER_SECOND,
        Math.max(MIN_PIXELS_PER_SECOND, current * Math.exp(-e.deltaY * 0.01)),
      )
      const x = e.clientX - el.getBoundingClientRect().left
      zoomAnchor.current = { t: (el.scrollLeft + x) / current, x }
      onZoom(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoom])

  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = zoomAnchor.current
    if (!el || !anchor) return
    el.scrollLeft = anchor.t * pixelsPerSecond - anchor.x
    zoomAnchor.current = null
  }, [pixelsPerSecond])

  // Keep the playhead in view during playback.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = time * pixelsPerSecond
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - 40
  }, [time, pixelsPerSecond, playing])

  const timeAt = (clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    return rect ? (clientX - rect.left) / pixelsPerSecond : 0
  }
  const seekToPointer = (clientX: number) => onSeek(timeAt(clientX))

  // Grow with the playhead, so playing past the end doesn't run it off the timeline.
  const visibleSeconds = Math.max(Math.max(end, time) + TAIL_SECONDS, viewport / pixelsPerSecond)
  const width = visibleSeconds * pixelsPerSecond
  const snapTimes = [
    time,
    ...TRACK_KINDS.flatMap((k) => {
      const clip = clips[k]
      return clip ? [clip.offset, clip.offset + clip.duration] : []
    }),
  ]

  return (
    <div className="grid grid-cols-[170px_minmax(0,1fr)] border-t border-line bg-panel">
      <div className="border-r border-line">
        <div className="h-7 border-b border-line" />
        {TRACK_KINDS.map((kind) => (
          <Fragment key={kind}>
            <TrackHead
              kind={kind}
              clip={clips[kind]}
              muted={props.muted[kind]}
              volume={props.volume[kind]}
              loading={props.loading === kind}
              onToggleMute={() => props.onToggleMute(kind)}
              onVolumeChange={(v) => props.onVolumeChange(kind, v)}
              onRemove={() => props.onRemove(kind)}
            />
            {kind === 'video' && (
              <div
                className="flex items-center border-b border-line px-3 text-2xs font-bold tracking-[0.08em] text-dim uppercase"
                style={{ height: SYNC_LANE_HEIGHT }}
              >
                {/* Trim to cap height so the caps, not the line box, are centred. */}
                <span className="[text-box:trim-both_cap_alphabetic]">Sync</span>
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
          className="relative min-w-full cursor-text"
          ref={contentRef}
          style={{ width }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            scrubbing.current = true
            onSelect(null)
            seekToPointer(e.clientX)
          }}
          onPointerMove={(e) => scrubbing.current && seekToPointer(e.clientX)}
          onPointerUp={() => (scrubbing.current = false)}
          onPointerCancel={() => (scrubbing.current = false)}
        >
          <Ruler
            pixelsPerSecond={pixelsPerSecond}
            seconds={visibleSeconds}
            range={range}
            snapTimes={snapTimes}
            onRangeChange={props.onRangeChange}
            onRangeReset={props.onRangeReset}
          />

          {TRACK_KINDS.map((kind) => {
            const clip = clips[kind]
            return (
              <Fragment key={kind}>
                <div
                  className="relative border-b border-line"
                  data-track={kind}
                  data-testid={`lane-${kind}`}
                  style={{ height: LANE_HEIGHT }}
                >
                  {clip ? (
                    <ClipView
                      kind={kind}
                      clip={clip}
                      pixelsPerSecond={pixelsPerSecond}
                      selected={props.selected === kind}
                      muted={props.muted[kind]}
                      onSelect={onSelect}
                      onOffsetChange={props.onOffsetChange}
                    />
                  ) : (
                    <div className="sticky left-0 inline-block px-4 py-[26px] text-xs text-dim">
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
                            if (file) props.onImport(file, kind)
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
                    onOffsetChange={props.onOffsetChange}
                  />
                )}
              </Fragment>
            )
          })}

          {/* Dim what won't be exported. */}
          {range && (
            <>
              <div
                className="pointer-events-none absolute top-7 bottom-0 left-0 bg-bg/60"
                style={{ width: range.start * pixelsPerSecond }}
              />
              <div
                className="pointer-events-none absolute top-7 right-0 bottom-0 bg-bg/60"
                style={{ left: range.end * pixelsPerSecond }}
              />
            </>
          )}

          <Playhead time={time} pixelsPerSecond={pixelsPerSecond} />
        </div>
      </div>
    </div>
  )
}
