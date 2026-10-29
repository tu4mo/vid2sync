import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { TRACK_KINDS, type Clips, type TimeRange, type TrackKind } from '../../media'
import { ClipView } from './ClipView'
import { LANE_HEIGHT, SYNC_LANE_HEIGHT } from './layout'
import { Ruler } from './Ruler'
import { SyncLane } from './SyncLane'
import { TrackHead } from './TrackHead'

export const MIN_PPS = 5
export const MAX_PPS = 2000

const TAIL_SECONDS = 10

interface Props {
  clips: Clips
  muted: Record<TrackKind, boolean>
  volume: Record<TrackKind, number>
  selected: TrackKind | null
  loading: TrackKind | null
  time: number
  end: number
  pps: number
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
  onZoom: (pps: number) => void
}

export function Timeline(props: Props) {
  const { clips, time, end, pps, playing, range, onSeek, onSelect, onZoom } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const zoomAnchor = useRef<{ t: number; x: number } | null>(null)
  const ppsRef = useRef(pps)
  const [viewport, setViewport] = useState(800)
  const [scrollLeft, setScrollLeft] = useState(0)

  useEffect(() => {
    ppsRef.current = pps
  }, [pps])

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
      const current = ppsRef.current
      const next = Math.min(MAX_PPS, Math.max(MIN_PPS, current * Math.exp(-e.deltaY * 0.01)))
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
    el.scrollLeft = anchor.t * pps - anchor.x
    zoomAnchor.current = null
  }, [pps])

  // Keep the playhead in view during playback.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !playing) return
    const x = time * pps
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = x - 40
  }, [time, pps, playing])

  const timeAt = (clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    return rect ? (clientX - rect.left) / pps : 0
  }
  const seekToPointer = (clientX: number) => onSeek(timeAt(clientX))

  const visibleSeconds = Math.max(end + TAIL_SECONDS, viewport / pps)
  const width = visibleSeconds * pps
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
            pps={pps}
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
                      pps={pps}
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
                    pps={pps}
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
                style={{ width: range.start * pps }}
              />
              <div
                className="pointer-events-none absolute top-7 right-0 bottom-0 bg-bg/60"
                style={{ left: range.end * pps }}
              />
            </>
          )}

          <div
            className="pointer-events-none absolute inset-y-0 w-0 -translate-x-px border-l-2 border-accent before:absolute before:top-0 before:-left-[7px] before:border-6 before:border-t-8 before:border-transparent before:border-t-accent"
            style={{ left: time * pps }}
          />
        </div>
      </div>
    </div>
  )
}
