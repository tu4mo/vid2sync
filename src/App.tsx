import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Engine } from './engine'
import { ErrorDialog } from './components/ErrorDialog/ErrorDialog'
import { Timeline, MAX_PPS, MIN_PPS } from './components/Timeline/Timeline'
import {
  TRACK_KINDS,
  formatTime,
  kindForFile,
  loadClip,
  type Clip,
  type Clips,
  type TimeRange,
  type TrackKind,
} from './media'

const engine = new Engine()

function syncVideo(el: HTMLVideoElement | null, clip: Clip | null, t: number, playing: boolean) {
  if (!el || !clip) return
  const local = t - clip.offset
  const inside = local >= 0 && local < clip.duration

  if (!playing || !inside) {
    if (!el.paused) el.pause()
    el.playbackRate = 1
    const target = Math.min(Math.max(local, 0), clip.duration)
    if (Math.abs(el.currentTime - target) > 0.005) el.currentTime = target
    return
  }

  // Audio is the master clock; nudge the video's rate to follow it, and hard-seek on big jumps.
  const drift = el.currentTime - local
  if (Math.abs(drift) > 0.3) el.currentTime = local
  else el.playbackRate = Math.min(1.1, Math.max(0.9, 1 - drift * 2))
  if (el.paused) void el.play().catch(() => {})
}

const MIN_RANGE = 0.05

const roundMs = (t: number) => Math.round(t * 1000) / 1000

export default function App() {
  const [clips, setClips] = useState<Clips>({ video: null, audio: null })
  const [muted, setMuted] = useState<Record<TrackKind, boolean>>({ video: false, audio: false })
  const [volume, setVolume] = useState<Record<TrackKind, number>>({ video: 1, audio: 1 })
  const [selected, setSelected] = useState<TrackKind | null>(null)
  const [loading, setLoading] = useState<TrackKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pps, setPps] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  /** In/out points on the timeline; null exports the whole video. */
  const [range, setRange] = useState<TimeRange | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const end = Math.max(0, ...TRACK_KINDS.map((k) => (clips[k] ? clips[k].offset + clips[k].duration : 0)))

  const gains = useMemo(
    () => ({
      video: muted.video ? 0 : volume.video,
      audio: muted.audio ? 0 : volume.audio,
    }),
    [muted, volume],
  )

  const pause = useCallback(() => {
    engine.pause()
    setTime(engine.now())
    setPlaying(false)
  }, [])

  const play = () => {
    if (end === 0) return
    engine.play(time >= end ? 0 : time)
    setPlaying(true)
  }

  const seek = (t: number) => {
    const clamped = Math.max(0, t)
    engine.seek(clamped)
    setTime(clamped)
  }

  // Stable identity so memoized clips on the timeline don't re-render every playback frame.
  const setOffset = useCallback((kind: TrackKind, offset: number) => {
    setClips((prev) => {
      const clip = prev[kind]
      return clip ? { ...prev, [kind]: { ...clip, offset: roundMs(Math.max(0, offset)) } } : prev
    })
  }, [])

  const setRangePoint = (which: keyof TimeRange, t: number) => {
    const video = clips.video
    const whole = video ? { start: video.offset, end: video.offset + video.duration } : { start: 0, end }
    setRange((prev) => {
      const next = { ...(prev ?? whole), [which]: roundMs(Math.max(0, t)) }
      // Like most editors: an in point after the out point (or vice versa) resets the other one.
      if (next.end - next.start < MIN_RANGE) {
        if (which === 'start') next.end = Math.max(whole.end, next.start + MIN_RANGE)
        else next.start = Math.max(0, Math.min(whole.start, next.end - MIN_RANGE))
      }
      return next.end - next.start < MIN_RANGE ? prev : next
    })
  }

  const removeClip = (kind: TrackKind) => {
    const clip = clips[kind]
    if (!clip) return
    pause()
    URL.revokeObjectURL(clip.url)
    setClips((prev) => ({ ...prev, [kind]: null }))
    setSelected(null)
  }

  const importFile = async (file: File, kind: TrackKind) => {
    pause()
    setLoading(kind)
    setError(null)
    try {
      const clip = await loadClip(file, kind, engine.ctx)
      setClips((prev) => {
        const old = prev[kind]
        if (old) URL.revokeObjectURL(old.url)
        return { ...prev, [kind]: clip }
      })
      setSelected(kind)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  const exportVideo = async () => {
    const video = clips.video
    if (!video) return
    pause()
    setError(null)
    setExportProgress(0)
    try {
      const { downloadBlob, exportSynced } = await import('./export')
      const blob = await exportSynced(clips, gains, range, setExportProgress)
      downloadBlob(blob, `${video.file.name.replace(/\.[^.]+$/, '')}-synced.mp4`)
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExportProgress(null)
    }
  }

  // Playback loop: read the audio clock, drive the playhead and the video element.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const t = engine.now()
      if (t >= end) {
        engine.pause()
        engine.seek(end)
        setTime(end)
        setPlaying(false)
        return
      }
      setTime(t)
      syncVideo(videoRef.current, clips.video, t, true)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, end, clips.video])

  useEffect(() => {
    engine.setClips(clips)
  }, [clips])

  useEffect(() => {
    if (!playing) syncVideo(videoRef.current, clips.video, time, false)
  }, [time, playing, clips.video])

  useEffect(() => {
    for (const kind of TRACK_KINDS) engine.setGain(kind, gains[kind])
  }, [gains])

  // The video element only plays its own sound when Web Audio couldn't decode it.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = muted.video || !!clips.video?.buffer
    el.volume = Math.min(1, volume.video)
  }, [muted.video, volume.video, clips.video])

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // Leave text fields, browser/OS shortcuts and the error dialog alone.
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || error) return
    if (e.key === ' ') {
      e.preventDefault()
      if (playing) pause()
      else play()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      const clip = selected && clips[selected]
      if (selected && clip) setOffset(selected, clip.offset + dir * (e.shiftKey ? 0.1 : 0.01))
      else seek(time + dir * (e.shiftKey ? 1 : 1 / 30))
    } else if (e.key === 'i') {
      setRangePoint('start', time)
    } else if (e.key === 'o') {
      setRangePoint('end', time)
    } else if (e.key === 'x') {
      setRange(null)
    } else if (e.key === 'Home') {
      seek(0)
    } else if (e.key === 'Escape') {
      setSelected(null)
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      removeClip(selected)
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const videoClip = clips.video
  const videoVisible = !!videoClip && time >= videoClip.offset && time < videoClip.offset + videoClip.duration

  return (
    <div
      className="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto_auto] select-none"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const files = [...e.dataTransfer.files]
        if (files.length === 0) {
          setError(
            'The drop didn’t contain a file. If you’re dragging from Photos, try Safari, ' +
              'or drag the video to the Desktop first and drop it from there.',
          )
          return
        }
        // A single file dropped onto a track goes to that track (e.g. a video's sound onto Audio).
        const target = (e.target as Element).closest<HTMLElement>('[data-track]')?.dataset.track
        for (const file of files) {
          const kind =
            files.length === 1 && (target === 'video' || target === 'audio') ? target : kindForFile(file)
          if (kind) void importFile(file, kind)
          else setError(`“${file.name}” doesn’t look like a video or audio file.`)
        }
      }}
    >
      {dragging && <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-bg/70 text-lg font-semibold text-accent">Drop video or audio to import</div>}
      <header className="flex items-center gap-4 border-b border-line px-4 py-2.5">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-[0.02em]">
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="size-7" />
          vid2sync
        </h1>
        <span className="text-xs text-dim">
          Drop files anywhere · <kbd>Space</kbd> play · drag clips to move · <kbd>Shift</kbd>-drag
          for fine moves · <kbd>←</kbd>/<kbd>→</kbd> nudge 10 ms (<kbd>Shift</kbd> 100 ms) ·{' '}
          <kbd>I</kbd>/<kbd>O</kbd> set export in/out (<kbd>X</kbd> clear) · <kbd>Ctrl</kbd>/<kbd>⌘</kbd>-scroll to zoom
        </span>
      </header>

      <main className="relative flex min-h-0 items-center justify-center bg-black">
        {videoClip && (
          <video
            ref={videoRef}
            src={videoClip.url}
            className="max-h-full max-w-full"
            playsInline
            preload="auto"
            style={{ visibility: videoVisible ? 'visible' : 'hidden' }}
          />
        )}
        {!videoClip && <div className="text-dim">Import a video to preview it here</div>}
      </main>

      <div className="flex items-center gap-2.5 border-t border-line bg-panel px-4 py-2">
        <button
          className="min-w-[70px] border-accent bg-accent font-semibold text-[#1a1206]"
          onClick={playing ? pause : play} disabled={end === 0}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={() => seek(0)} title="Go to start">⏮</button>
        <span className="font-mono tabular-nums" data-testid="clock">
          {formatTime(time)} <span className="text-dim">/ {formatTime(end)}</span>
        </span>
        <div className="ml-3 flex items-center gap-1.5 text-xs">
          <button onClick={() => setRangePoint('start', time)} title="Set export start at playhead (I)">
            In
          </button>
          <button onClick={() => setRangePoint('end', time)} title="Set export end at playhead (O)">
            Out
          </button>
          {range ? (
            <span className="font-mono whitespace-nowrap" data-testid="range">
              {formatTime(range.start)} – {formatTime(range.end)}{' '}
              <span className="text-dim">({(range.end - range.start).toFixed(2)} s)</span>
              <button className="ml-0.5 px-1.5 py-0" onClick={() => setRange(null)} title="Clear in/out (X)">
                ×
              </button>
            </span>
          ) : (
            <span className="text-dim">Whole video</span>
          )}
        </div>
        <button
          className="ml-auto tabular-nums"
          onClick={() => void exportVideo()}
          disabled={!clips.video || exportProgress !== null}
          title="Save the video with the synced audio as MP4"
        >
          {exportProgress === null ? 'Export MP4' : `Exporting… ${Math.round(exportProgress * 100)}%`}
        </button>
        <label className="ml-3 flex items-center gap-2 text-dim">
          Zoom
          <input
            type="range"
            min={Math.log(MIN_PPS)}
            max={Math.log(MAX_PPS)}
            step={0.01}
            value={Math.log(pps)}
            onChange={(e) => setPps(Math.exp(Number(e.target.value)))}
          />
        </label>
      </div>

      <Timeline
        clips={clips}
        muted={muted}
        volume={volume}
        onVolumeChange={(kind, v) => setVolume((prev) => ({ ...prev, [kind]: v }))}
        selected={selected}
        loading={loading}
        time={time}
        end={end}
        pps={pps}
        playing={playing}
        onSelect={setSelected}
        onOffsetChange={setOffset}
        onSeek={seek}
        range={range}
        onRangeChange={setRangePoint}
        onToggleMute={(kind) => setMuted((m) => ({ ...m, [kind]: !m[kind] }))}
        onImport={(file, kind) => void importFile(file, kind)}
        onRemove={removeClip}
        onZoom={setPps}
      />

      <ErrorDialog message={error} onClose={() => setError(null)} />
    </div>
  )
}
