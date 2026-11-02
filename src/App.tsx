import { useEffect, useEffectEvent, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { ErrorDialog } from './components/ErrorDialog/ErrorDialog'
import { FileDrop } from './components/FileDrop/FileDrop'
import {
  TRACK_KINDS,
  moveClip,
  roundMs,
  trimClip,
  untrimClip,
  updateClip,
  type ClipEdit,
  type Clips,
  type TrackKind,
  type Volumes,
} from './lib/clip'
import { kindForFile, loadClip } from './lib/media'
import { saveExport } from './lib/saveExport'
import { MIN_PIXELS_PER_SECOND } from './lib/zoom'
import { Preview } from './panels/Preview/Preview'
import {
  LANE_DEFAULT_HEIGHT,
  LANE_MIN_HEIGHT,
  SCRUB_STRIP_HEIGHT,
  SYNC_LANE_HEIGHT,
} from './panels/Timeline/layout'
import { Timeline } from './panels/Timeline/Timeline'
import { TOOLBAR_HEIGHT, Toolbar } from './panels/Toolbar/Toolbar'
import { usePlayback } from './usePlayback'

// How far the arrow keys move a selected clip, and the playhead otherwise, in seconds (with Shift).
const NUDGE_CLIP = 0.01
const NUDGE_CLIP_SHIFT = 0.1
const NUDGE_PLAYHEAD = 1 / 30
const NUDGE_PLAYHEAD_SHIFT = 1

// The toolbar, then the timeline's fixed rows.
const TIMELINE_CHROME_HEIGHT =
  TOOLBAR_HEIGHT + 2 * SCRUB_STRIP_HEIGHT + SYNC_LANE_HEIGHT
const TIMELINE_HEIGHT = TIMELINE_CHROME_HEIGHT + 2 * LANE_DEFAULT_HEIGHT
const TIMELINE_MIN_HEIGHT = TIMELINE_CHROME_HEIGHT + 2 * LANE_MIN_HEIGHT

/** An effect cleanup that frees the blob URL, for when it stops being used. */
function revokeOnChange(url: string | undefined) {
  return url ? () => URL.revokeObjectURL(url) : undefined
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

export function App() {
  const [clips, setClips] = useState<Clips>({ video: null, audio: null })
  const [volume, setVolume] = useState<Volumes>({
    video: 1,
    audio: 1,
  })
  const [selected, setSelected] = useState<TrackKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(MIN_PIXELS_PER_SECOND)
  const [followPlayhead, setFollowPlayhead] = useState(true)
  const [exportProgress, setExportProgress] = useState<number | null>(null)

  const { time, playing, end, play, pause, stopAt, seek, ctx } = usePlayback(
    clips,
    volume,
  )

  function editClip(kind: TrackKind, edit: ClipEdit) {
    setClips((prev) => updateClip(prev, kind, edit))
  }

  function changeVolume(kind: TrackKind, v: number) {
    setVolume((prev) => ({ ...prev, [kind]: v }))
  }

  function removeClip(kind: TrackKind) {
    pause()
    setClips((prev) => ({ ...prev, [kind]: null }))
    setSelected(null)
  }

  async function importFile(file: File, kind: TrackKind) {
    // The new clip starts at the playhead.
    const offset = roundMs(pause())
    try {
      const clip = await loadClip(file, kind, ctx)
      setClips((prev) => ({ ...prev, [kind]: { ...clip, offset } }))
      setSelected(kind)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function importFiles(files: File[], track?: TrackKind) {
    // Clear once up front, so one file's error isn't wiped by the next file's import.
    setError(null)
    const taken = new Set<TrackKind>()
    for (const file of files) {
      const kind = files.length === 1 && track ? track : kindForFile(file)
      if (!kind) {
        setError(`“${file.name}” doesn’t look like a video or audio file.`)
      } else if (taken.has(kind)) {
        // A track holds one clip, so a second file of the same kind would race the first.
        setError(`Only one ${kind} file can be imported at a time.`)
      } else {
        taken.add(kind)
        void importFile(file, kind)
      }
    }
  }

  function dropFiles(files: File[], target: Element) {
    if (files.length === 0) {
      setError(
        'The drop didn’t contain a file. If you’re dragging from Photos, try Safari, ' +
          'or drag the video to the Desktop first and drop it from there.',
      )
      return
    }
    // A single file dropped onto a track goes to that track (e.g. a video's sound onto Audio).
    const track = target.closest<HTMLElement>('[data-track]')?.dataset.track
    importFiles(
      files,
      TRACK_KINDS.find((k) => k === track),
    )
  }

  async function exportVideo() {
    pause()
    setError(null)
    setExportProgress(0)
    try {
      await saveExport(clips, volume, setExportProgress)
    } catch (e) {
      setError(`Export failed: ${errorMessage(e)}`)
    }
    setExportProgress(null)
  }

  // Free each file's blob URL once its clip is replaced or removed. Kept here rather than in the
  // components that show the clip: App mounts with no clips, so StrictMode's extra mount can't
  // revoke a URL that's still in use.
  const videoUrl = clips.video?.url
  const audioUrl = clips.audio?.url
  useEffect(() => revokeOnChange(videoUrl), [videoUrl])
  useEffect(() => revokeOnChange(audioUrl), [audioUrl])

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
    // Trim keys act on the selected clip, or else the video.
    const trimTarget = selected ?? 'video'
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
      if (selected && clips[selected]) {
        const step = e.shiftKey ? NUDGE_CLIP_SHIFT : NUDGE_CLIP
        editClip(selected, (c) => moveClip(c, c.offset + dir * step))
      } else {
        const step = e.shiftKey ? NUDGE_PLAYHEAD_SHIFT : NUDGE_PLAYHEAD
        seek(time + dir * step)
      }
    } else if (e.key === 'i') {
      editClip(trimTarget, (c) => trimClip(c, 'start', time))
    } else if (e.key === 'o') {
      editClip(trimTarget, (c) => trimClip(c, 'end', time))
    } else if (e.key === 'x') {
      editClip(trimTarget, (c) => untrimClip(c))
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

  return (
    <FileDrop
      className="h-full select-none"
      label="Drop video or audio to import"
      onDrop={dropFiles}
    >
      <Group orientation="vertical">
        <Panel minSize={80}>
          <Preview
            clip={clips.video}
            time={time}
            playing={playing}
            volume={volume.video}
          />
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
              hasClips={!!(clips.video || clips.audio)}
              canExport={!!clips.video}
              exportProgress={exportProgress}
              pixelsPerSecond={pixelsPerSecond}
              followPlayhead={followPlayhead}
              onPlay={play}
              onPause={pause}
              onSeek={seek}
              onExport={() => void exportVideo()}
              onZoom={setPixelsPerSecond}
              onToggleFollowPlayhead={() => setFollowPlayhead((f) => !f)}
            />

            <Timeline
              clips={clips}
              volume={volume}
              onVolumeChange={changeVolume}
              selected={selected}
              time={time}
              end={end}
              pixelsPerSecond={pixelsPerSecond}
              playing={playing}
              followPlayhead={followPlayhead}
              onSelect={setSelected}
              onEdit={editClip}
              onSeek={seek}
              onPlayPastTimeline={stopAt}
              onImport={importFiles}
              onRemove={removeClip}
              onZoom={setPixelsPerSecond}
            />
          </div>
        </Panel>
      </Group>

      <ErrorDialog message={error} onClose={() => setError(null)} />
    </FileDrop>
  )
}
