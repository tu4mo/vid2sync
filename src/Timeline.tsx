import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Waveform } from './Waveform'
import { TRACK_KINDS, formatTime, type Clip, type Clips, type TimeRange, type TrackKind } from './media'

export const MIN_PPS = 5
export const MAX_PPS = 2000

const LANE_HEIGHT = 72
const WAVE_HEIGHT = 48
const TAIL_SECONDS = 10
const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

const LABELS: Record<TrackKind, string> = { video: 'Video', audio: 'Audio' }
const WAVE_COLORS: Record<TrackKind, string> = { video: '#9cc4ff', audio: '#8ef0b8' }

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
      <div className="ruler">
        {ticks.map((t) => (
          <div key={t} className="tick" style={{ left: t * pps }}>
            <span>{formatTick(t, step)}</span>
          </div>
        ))}
      </div>
    )
  }, [pps, visibleSeconds])

  return (
    <div className="timeline">
      <div className="heads">
        <div className="ruler-head" />
        {TRACK_KINDS.map((kind) => (
          <TrackHead
            key={kind}
            kind={kind}
            clip={clips[kind]}
            muted={props.muted[kind]}
            volume={props.volume[kind]}
            loading={props.loading === kind}
            onToggleMute={() => props.onToggleMute(kind)}
            onVolumeChange={(v) => props.onVolumeChange(kind, v)}
            onImport={(file) => props.onImport(file, kind)}
          />
        ))}
      </div>

      <div className="scroll" ref={scrollRef}>
        <div
          className="content"
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
              <div key={kind} className="lane" data-track={kind} style={{ height: LANE_HEIGHT }}>
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
                  <div className="lane-hint">
                    Import or drop {kind === 'video' ? 'a video' : 'an audio'} file
                  </div>
                )}
              </div>
            )
          })}

          {range && (
            <>
              <div
                className="range"
                style={{ left: range.start * pps, width: (range.end - range.start) * pps }}
              />
              {(['start', 'end'] as const).map((which) => (
                <div
                  key={which}
                  className={`range-handle range-${which}`}
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

          <div className="playhead" style={{ left: time * pps }} />
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
}

function TrackHead(props: TrackHeadProps) {
  const { kind, clip, muted, volume, loading, onToggleMute, onVolumeChange, onImport } = props
  return (
    <div className={`head head-${kind}`} data-track={kind} style={{ height: LANE_HEIGHT }}>
      <div className="head-title">
        <span className="head-label">{LABELS[kind]}</span>
        <span className="head-file" title={clip?.file.name}>
          {loading ? 'Loading…' : (clip?.file.name ?? 'No file')}
        </span>
        <button
          className={`mute ${muted ? 'on' : ''}`}
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          M
        </button>
      </div>
      <div className="head-volume">
        <input
          className="volume"
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
        <span className="volume-value">{Math.round(volume * 100)}%</span>
      </div>
      <label className="import">
        {clip ? 'Replace…' : 'Import…'}
        <input
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

interface ClipViewProps {
  kind: TrackKind
  clip: Clip
  pps: number
  selected: boolean
  muted: boolean
  onSelect: (kind: TrackKind) => void
  onOffsetChange: (kind: TrackKind, offset: number) => void
}

const ClipView = memo(function ClipView(props: ClipViewProps) {
  const { kind, clip, pps, selected, muted, onSelect, onOffsetChange } = props
  const drag = useRef<{ lastX: number; offset: number } | null>(null)
  const width = clip.duration * pps

  return (
    <div
      className={`clip clip-${kind} ${selected ? 'selected' : ''} ${muted ? 'muted' : ''}`}
      style={{ left: clip.offset * pps, width }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        onSelect(kind)
        drag.current = { lastX: e.clientX, offset: clip.offset }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        // Shift slows the drag down 10× for fine alignment.
        const dx = (e.clientX - d.lastX) * (e.shiftKey ? 0.1 : 1)
        d.lastX = e.clientX
        d.offset = Math.max(0, d.offset + dx / pps)
        onOffsetChange(kind, d.offset)
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="clip-name">
        {clip.file.name} <span className="clip-offset">@ {formatTime(clip.offset)}</span>
      </div>
      {clip.peaks ? (
        <Waveform
          peaks={clip.peaks}
          duration={clip.duration}
          width={width}
          height={WAVE_HEIGHT}
          color={WAVE_COLORS[kind]}
        />
      ) : (
        <div className="no-audio">no audio track</div>
      )}
    </div>
  )
})
