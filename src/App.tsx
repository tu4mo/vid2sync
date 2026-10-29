import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { ErrorDialog } from './components/ErrorDialog/ErrorDialog'
import {
  TRACK_KINDS,
  clipSpan,
  kindForFile,
  loadClip,
  minOffset,
  type Clip,
  type Clips,
  type TimeRange,
  type TrackKind,
} from './lib/media'
import { Playback } from './lib/playback'
import { MIN_PIXELS_PER_SECOND } from './lib/zoom'
import {
  LANE_DEFAULT_HEIGHT,
  LANE_MIN_HEIGHT,
  RULER_HEIGHT,
  SYNC_LANE_HEIGHT,
} from './panels/Timeline/layout'
import { Timeline } from './panels/Timeline/Timeline'
import { Toolbar } from './panels/Toolbar/Toolbar'

const playback = new Playback()

function syncVideo(
  el: HTMLVideoElement | null,
  clip: Clip | null,
  t: number,
  playing: boolean,
) {
  if (!el || !clip) {
    return
  }
  const local = t - clip.offset
  const inside = local >= clip.trim.start && local < clip.trim.end

  if (!playing || !inside) {
    if (!el.paused) {
      el.pause()
    }
    el.playbackRate = 1
    const target = Math.min(Math.max(local, clip.trim.start), clip.trim.end)
    if (Math.abs(el.currentTime - target) > 0.005) {
      el.currentTime = target
    }
    return
  }

  // Audio is the master clock; nudge the video's rate to follow it, and hard-seek on big jumps.
  const drift = el.currentTime - local
  if (Math.abs(drift) > 0.3) {
    el.currentTime = local
  } else {
    el.playbackRate = Math.min(1.1, Math.max(0.9, 1 - drift * 2))
  }
  if (el.paused) {
    void el.play().catch(() => {})
  }
}

// The shortest a clip can be trimmed to.
const MIN_CLIP = 0.05

// The toolbar and the timeline's top border, then the timeline's fixed rows.
const TIMELINE_CHROME_HEIGHT = 42 + 1 + RULER_HEIGHT + SYNC_LANE_HEIGHT
const TIMELINE_HEIGHT = TIMELINE_CHROME_HEIGHT + 2 * LANE_DEFAULT_HEIGHT
const TIMELINE_MIN_HEIGHT = TIMELINE_CHROME_HEIGHT + 2 * LANE_MIN_HEIGHT

function roundMs(t: number) {
  return Math.round(t * 1000) / 1000
}

export default function App() {
  const [clips, setClips] = useState<Clips>({ video: null, audio: null })
  const [muted, setMuted] = useState<Record<TrackKind, boolean>>({
    video: false,
    audio: false,
  })
  const [volume, setVolume] = useState<Record<TrackKind, number>>({
    video: 1,
    audio: 1,
  })
  const [selected, setSelected] = useState<TrackKind | null>(null)
  const [loading, setLoading] = useState<TrackKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(MIN_PIXELS_PER_SECOND)
  const [dragging, setDragging] = useState(false)
  const [exportProgress, setExportProgress] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const end = Math.max(
    0,
    ...TRACK_KINDS.map((k) => (clips[k] ? clipSpan(clips[k]).end : 0)),
  )

  const gains = useMemo(
    () => ({
      video: muted.video ? 0 : volume.video,
      audio: muted.audio ? 0 : volume.audio,
    }),
    [muted, volume],
  )

  const pause = useCallback(() => {
    playback.pause()
    setTime(playback.now())
    setPlaying(false)
  }, [])

  /** Stops playback with the playhead parked at `t`. */
  const stopAt = useCallback((t: number) => {
    playback.pause()
    playback.seek(t)
    setTime(t)
    setPlaying(false)
  }, [])

  function play() {
    if (end === 0) {
      return
    }
    playback.play(time)
    setPlaying(true)
  }

  function seek(t: number) {
    const clamped = Math.max(0, t)
    playback.seek(clamped)
    setTime(clamped)
  }

  // Stable identity so memoized clips on the timeline don't re-render every playback frame.
  const setOffset = useCallback((kind: TrackKind, offset: number) => {
    setClips((prev) => {
      const clip = prev[kind]
      return clip
        ? {
            ...prev,
            [kind]: {
              ...clip,
              offset: roundMs(Math.max(minOffset(clip), offset)),
            },
          }
        : prev
    })
  }, [])

  /** Moves the trimmed part's start or end to timeline time `t`, within the file and 0:00. */
  const setTrim = useCallback(
    (kind: TrackKind, which: keyof TimeRange, t: number) => {
      setClips((prev) => {
        const clip = prev[kind]
        if (!clip) {
          return prev
        }
        const local = roundMs(t - clip.offset)
        const trim =
          which === 'start'
            ? {
                ...clip.trim,
                start: Math.min(
                  Math.max(0, -clip.offset, local),
                  clip.trim.end - MIN_CLIP,
                ),
              }
            : {
                ...clip.trim,
                end: Math.max(
                  Math.min(clip.duration, local),
                  clip.trim.start + MIN_CLIP,
                ),
              }
        return { ...prev, [kind]: { ...clip, trim } }
      })
    },
    [],
  )

  /** Puts one end of the trim, or with no argument both, back at the file's edge. */
  const resetTrim = useCallback((kind: TrackKind, which?: keyof TimeRange) => {
    setClips((prev) => {
      const clip = prev[kind]
      if (!clip) {
        return prev
      }
      // The start can only go back as far as 0:00.
      const edges = { start: Math.max(0, -clip.offset), end: clip.duration }
      const trim = which ? { ...clip.trim, [which]: edges[which] } : edges
      return { ...prev, [kind]: { ...clip, trim } }
    })
  }, [])

  function removeClip(kind: TrackKind) {
    const clip = clips[kind]
    if (!clip) {
      return
    }
    pause()
    URL.revokeObjectURL(clip.url)
    setClips((prev) => ({ ...prev, [kind]: null }))
    setSelected(null)
  }

  async function importFile(file: File, kind: TrackKind) {
    pause()
    // The new clip starts at the playhead.
    const offset = roundMs(playback.now())
    setLoading(kind)
    setError(null)
    try {
      const clip = await loadClip(file, kind, playback.ctx)
      setClips((prev) => {
        const old = prev[kind]
        if (old) {
          URL.revokeObjectURL(old.url)
        }
        return { ...prev, [kind]: { ...clip, offset } }
      })
      setSelected(kind)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  async function exportVideo() {
    const video = clips.video
    if (!video) {
      return
    }
    pause()
    setError(null)
    setExportProgress(0)
    try {
      const { downloadBlob, exportSynced } = await import('./lib/export')
      const blob = await exportSynced(clips, gains, setExportProgress)
      downloadBlob(
        blob,
        `${video.file.name.replace(/\.[^.]+$/, '')}-synced.mp4`,
      )
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExportProgress(null)
    }
  }

  // Playback loop: read the audio clock, drive the playhead and the video element.
  useEffect(() => {
    if (!playing) {
      return
    }
    let raf = 0
    function tick() {
      const t = playback.now()
      // Stop when playback runs off the end, but not when it was started past the end.
      if (t >= end && playback.startedFrom() < end) {
        stopAt(end)
        return
      }
      setTime(t)
      syncVideo(videoRef.current, clips.video, t, true)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, end, clips.video, stopAt])

  useEffect(() => {
    playback.setClips(clips)
  }, [clips])

  useEffect(() => {
    if (!playing) {
      syncVideo(videoRef.current, clips.video, time, false)
    }
  }, [time, playing, clips.video])

  useEffect(() => {
    for (const kind of TRACK_KINDS) {
      playback.setGain(kind, gains[kind])
    }
  }, [gains])

  // The video element only plays its own sound when Web Audio couldn't decode it.
  useEffect(() => {
    const el = videoRef.current
    if (!el) {
      return
    }
    el.muted = muted.video || !!clips.video?.buffer
    el.volume = Math.min(1, volume.video)
  }, [muted.video, volume.video, clips.video])

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // Leave text fields, browser/OS shortcuts and the error dialog alone.
    if (
      e.target instanceof HTMLInputElement ||
      e.metaKey ||
      e.ctrlKey ||
      error
    ) {
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      if (playing) {
        pause()
      } else {
        play()
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      const clip = selected && clips[selected]
      if (selected && clip) {
        setOffset(selected, clip.offset + dir * (e.shiftKey ? 0.1 : 0.01))
      } else {
        seek(time + dir * (e.shiftKey ? 1 : 1 / 30))
      }
    } else if (e.key === 'i') {
      setTrim('video', 'start', time)
    } else if (e.key === 'o') {
      setTrim('video', 'end', time)
    } else if (e.key === 'x') {
      resetTrim('video')
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
  const videoSpan = videoClip && clipSpan(videoClip)
  const videoVisible =
    !!videoSpan && time >= videoSpan.start && time < videoSpan.end

  return (
    <div
      className="relative h-full select-none"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) {
          setDragging(false)
        }
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
        const target = (e.target as Element).closest<HTMLElement>(
          '[data-track]',
        )?.dataset.track
        for (const file of files) {
          const kind =
            files.length === 1 && (target === 'video' || target === 'audio')
              ? target
              : kindForFile(file)
          if (kind) {
            void importFile(file, kind)
          } else {
            setError(`“${file.name}” doesn’t look like a video or audio file.`)
          }
        }
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-bg/70 text-lg font-semibold text-accent">
          Drop video or audio to import
        </div>
      )}
      <Group orientation="vertical">
        <Panel minSize={80}>
          <main className="relative flex h-full items-center justify-center bg-black">
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
            {!videoClip && (
              <div className="text-dim">Import a video to preview it here</div>
            )}
          </main>
        </Panel>

        <Separator className="h-px bg-line transition-colors data-[separator=active]:bg-accent data-[separator=focus]:bg-line-strong data-[separator=hover]:bg-line-strong" />

        <Panel
          defaultSize={TIMELINE_HEIGHT}
          minSize={TIMELINE_MIN_HEIGHT}
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="flex h-full flex-col bg-panel">
            <Toolbar
              playing={playing}
              end={end}
              canExport={!!clips.video}
              exportProgress={exportProgress}
              pixelsPerSecond={pixelsPerSecond}
              onPlay={play}
              onPause={pause}
              onSeek={seek}
              onExport={() => void exportVideo()}
              onZoom={setPixelsPerSecond}
            />

            <Timeline
              clips={clips}
              muted={muted}
              volume={volume}
              onVolumeChange={(kind, v) =>
                setVolume((prev) => ({ ...prev, [kind]: v }))
              }
              selected={selected}
              loading={loading}
              time={time}
              end={end}
              pixelsPerSecond={pixelsPerSecond}
              playing={playing}
              onSelect={setSelected}
              onOffsetChange={setOffset}
              onSeek={seek}
              onReachEnd={stopAt}
              onTrimChange={setTrim}
              onTrimReset={resetTrim}
              onToggleMute={(kind) =>
                setMuted((m) => ({ ...m, [kind]: !m[kind] }))
              }
              onImport={(file, kind) => void importFile(file, kind)}
              onRemove={removeClip}
              onZoom={setPixelsPerSecond}
            />
          </div>
        </Panel>
      </Group>

      <ErrorDialog message={error} onClose={() => setError(null)} />
    </div>
  )
}
