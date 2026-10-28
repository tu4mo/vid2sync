import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ClipView } from './ClipView'
import { SyncLane, SYNC_LANE_HEIGHT } from './SyncLane'
import { TRACK_KINDS, type Clip, type Clips, type TimeRange, type TrackKind } from '../../media'

export const MIN_PPS = 5
export const MAX_PPS = 2000

const LANE_HEIGHT = 72
const TAIL_SECONDS = 10
const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

const LABELS: Record<TrackKind, string> = { video: 'Video', audio: 'Audio' }
// Full class names, so Tailwind finds them in the source.
const HEAD_BORDERS: Record<TrackKind, string> = { video: 'border-l-video', audio: 'border-l-audio' }

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
  range: TimeRange | null
  onRangeChange: (which: keyof TimeRange, t: number) => void
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
  // Memoized so the ruler isn't rebuilt on every playback frame.
  const ruler = useMemo(() => {
    const step = TICK_STEPS.find((s) => s * pps >= 80) ?? TICK_STEPS[TICK_STEPS.length - 1]
    const ticks: number[] = []
    for (let t = 0; t <= visibleSeconds; t += step) ticks.push(t)
    return (
      <div className="relative h-7 border-b border-line bg-panel-2">
        {ticks.map((t) => (
          <div key={t} className="absolute top-3.5 bottom-0 border-l border-line-strong" style={{ left: t * pps }}>
            <span className="absolute -top-[13px] left-1 text-2xs whitespace-nowrap text-dim tabular-nums">
              {formatTick(t, step)}
            </span>
          </div>
        ))}
      </div>
    )
  }, [pps, visibleSeconds])

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
              onImport={(file) => props.onImport(file, kind)}
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
          {ruler}

          {TRACK_KINDS.map((kind) => {
            const clip = clips[kind]
            return (
              <Fragment key={kind}>
                <div className="relative border-b border-line" data-track={kind} data-testid={`lane-${kind}`} style={{ height: LANE_HEIGHT }}>
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
                      Import or drop {kind === 'video' ? 'a video' : 'an audio'} file
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

          {range && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 border-x border-accent bg-accent/10"
                style={{ left: range.start * pps, width: (range.end - range.start) * pps }}
              />
              {(['start', 'end'] as const).map((which) => (
                <div
                  key={which}
                  className={`absolute top-0 z-1 h-7 w-3 cursor-ew-resize touch-none bg-accent ${
                    which === 'start' ? '-translate-x-3 rounded-l' : 'rounded-r'
                  }`}
                  style={{ left: range[which] * pps }}
                  title={which === 'start' ? 'Export start' : 'Export end'}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      props.onRangeChange(which, timeAt(e.clientX))
                    }
                  }}
                />
              ))}
            </>
          )}

          <div
            className="pointer-events-none absolute inset-y-0 w-0 -translate-x-px border-l-2 border-accent before:absolute before:top-0 before:-left-[7px] before:border-6 before:border-t-8 before:border-transparent before:border-t-accent"
            style={{ left: time * pps }} />
        </div>
      </div>
    </div>
  )
}

function formatTick(t: number, step: number): string {
  if (step >= 1) {
    const m = Math.floor(t / 60)
    const s = Math.round(t - m * 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  return `${t.toFixed(step < 0.1 ? 2 : 1)}s`
}

interface TrackHeadProps {
  kind: TrackKind
  clip: Clip | null
  muted: boolean
  volume: number
  loading: boolean
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  onImport: (file: File) => void
  onRemove: () => void
}

function TrackHead(props: TrackHeadProps) {
  const { kind, clip, muted, volume, loading, onToggleMute, onVolumeChange, onImport, onRemove } = props
  return (
    <div
      className={`flex flex-col justify-center gap-[3px] border-b border-l-3 border-b-line px-2.5 ${HEAD_BORDERS[kind]}`}
      data-track={kind}
      data-testid={`head-${kind}`} style={{ height: LANE_HEIGHT }}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-semibold">{LABELS[kind]}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-dim">{loading && 'Loading…'}</span>
        <button
          className="px-1.5 py-0 text-2xs font-bold aria-pressed:border-danger aria-pressed:bg-danger aria-pressed:text-white"
          aria-label="Mute"
          aria-pressed={muted}
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          M
        </button>
        {clip && (
          <button
            className="px-1.5 py-0 text-2xs font-bold enabled:hover:border-danger enabled:hover:text-danger"
            aria-label="Remove clip"
            onClick={onRemove}
            title="Remove clip (Delete)"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          className="h-3.5 min-w-0 flex-1 accent-accent"
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={volume}
          disabled={muted}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          onDoubleClick={() => onVolumeChange(1)}
          title={`Volume ${Math.round(volume * 100)}% (double-click to reset)`}
        />
        <span className="w-[34px] text-right text-2xs text-dim tabular-nums">{Math.round(volume * 100)}%</span>
      </div>
      <label className="cursor-pointer self-start text-xs text-accent">
        {clip ? 'Replace…' : 'Import…'}
        <input
          className="hidden"
          type="file"
          accept={`${kind}/*`}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImport(file)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
