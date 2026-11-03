import { useEffect, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { ErrorDialog } from './components/ErrorDialog/ErrorDialog'
import { FileDrop } from './components/FileDrop/FileDrop'
import {
  TIMELINE_HEIGHT_PX,
  TOOLBAR_HEIGHT_PX,
  TIMELINE_MIN_HEIGHT_PX,
} from './layout'
import {
  roundMs,
  updateClip,
  type ClipEdit,
  type Clips,
  type TrackKind,
  type Volumes,
} from './lib/clip'
import { loadClip, routeFiles } from './lib/media'
import { saveExport } from './lib/saveExport'
import { MIN_PIXELS_PER_SECOND } from './lib/zoom'
import { Preview } from './panels/Preview/Preview'
import { Timeline } from './panels/Timeline/Timeline'
import { Toolbar } from './panels/Toolbar/Toolbar'
import { usePlayback } from './usePlayback'
import { useShortcuts } from './useShortcuts'

/** An effect cleanup that frees the blob URL, for when it stops being used. */
function revokeOnChange(url: string | undefined) {
  return url ? () => URL.revokeObjectURL(url) : undefined
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

export function App() {
  const [clips, setClips] = useState<Clips>({ video: null, audio: null })
  const [volume, setVolume] = useState<Volumes>({ video: 1, audio: 1 })
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

  function importFiles(files: File[]) {
    const routes = routeFiles(files)
    // Set before the imports start, so a failed import's error replaces it rather than the reverse.
    setError(routes.error)
    for (const { file, kind } of routes.imports) {
      void importFile(file, kind)
    }
  }

  function dropFiles(files: File[]) {
    if (files.length === 0) {
      setError(
        'The drop didn’t contain a file. If you’re dragging from Photos, try Safari, ' +
          'or drag the video to the Desktop first and drop it from there.',
      )
      return
    }
    importFiles(files)
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

  useShortcuts({
    enabled: !error,
    clips,
    selected,
    time,
    playing,
    play,
    pause,
    seek,
    onEdit: editClip,
    onSelect: setSelected,
    onRemove: removeClip,
  })

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
          defaultSize={TOOLBAR_HEIGHT_PX + TIMELINE_HEIGHT_PX}
          minSize={TOOLBAR_HEIGHT_PX + TIMELINE_MIN_HEIGHT_PX}
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
              onZoom={setPixelsPerSecond}
            />
          </div>
        </Panel>
      </Group>

      <ErrorDialog message={error} onClose={() => setError(null)} />
    </FileDrop>
  )
}
