import { useEffect, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { ErrorDialog } from './components/ErrorDialog/ErrorDialog'
import { FileDrop } from './components/FileDrop/FileDrop'
import { useImport } from './hooks/useImport'
import { usePlayback } from './hooks/usePlayback'
import { useShortcuts } from './hooks/useShortcuts'
import { autoSyncFor } from './lib/autoSync'
import {
  syncClips,
  updateClip,
  type ClipEdit,
  type Clips,
  type TrackKind,
  type Volumes,
} from './lib/clip'
import { errorMessage } from './lib/error'
import { saveExport } from './lib/export'
import {
  SYNC_TRANSITION_MS,
  TIMELINE_HEIGHT_PX,
  TOOLBAR_HEIGHT_PX,
  TIMELINE_MIN_HEIGHT_PX,
} from './lib/layout'
import { MIN_PIXELS_PER_SECOND } from './lib/zoom'
import { Preview } from './panels/Preview/Preview'
import { Timeline } from './panels/Timeline/Timeline'
import { Toolbar } from './panels/Toolbar/Toolbar'

/** An effect cleanup that frees the blob URL, for when it stops being used. */
function revokeOnChange(url: string | undefined) {
  return url ? () => URL.revokeObjectURL(url) : undefined
}

export function App() {
  const [clips, setClips] = useState<Clips>({ video: null, audio: null })
  const [volume, setVolume] = useState<Volumes>({ video: 1, audio: 1 })
  const [selected, setSelected] = useState<TrackKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(MIN_PIXELS_PER_SECOND)
  const [followPlayhead, setFollowPlayhead] = useState(true)
  const [exporting, setExporting] = useState(false)
  /** The sync offset auto-sync found when the clips were imported, or null when it couldn't sync them. */
  const [foundSyncOffset, setFoundSyncOffset] = useState<number | null>(null)
  /** Whether the clips are gliding to where auto-sync put them, rather than jumping. */
  const [gliding, setGliding] = useState(false)

  const { time, playing, end, play, pause, stopAt, seek, ctx } = usePlayback(
    clips,
    volume,
  )

  function editClip(kind: TrackKind, edit: ClipEdit) {
    setClips((prev) => updateClip(prev, kind, edit))
  }

  function setSyncOffset(syncOffset: number) {
    setClips((prev) => syncClips(prev, syncOffset))
  }

  function changeVolume(kind: TrackKind, v: number) {
    setVolume((prev) => ({ ...prev, [kind]: v }))
  }

  function removeClip(kind: TrackKind) {
    pause()
    setClips((prev) => ({ ...prev, [kind]: null }))
    setSelected(null)
  }

  /** Moves the clips to where auto-sync matched them, with a transition, so you see them move. */
  function autoSyncTo(syncOffset: number) {
    setGliding(true)
    setSyncOffset(syncOffset)
    setTimeout(() => setGliding(false), SYNC_TRANSITION_MS)
  }

  function syncImported(syncOffset: number | null) {
    setFoundSyncOffset(syncOffset)
    if (syncOffset !== null) {
      autoSyncTo(syncOffset)
    }
  }

  const { importing, importFiles } = useImport({
    ctx,
    clips,
    pause,
    onLoad: setClips,
    onSync: syncImported,
    onError: setError,
  })

  async function exportVideo() {
    pause()
    setError(null)
    setExporting(true)
    try {
      await saveExport(clips, volume)
    } catch (e) {
      setError(`Export failed: ${errorMessage(e)}`)
    }
    setExporting(false)
  }

  // Free each file's blob URL once its clip is replaced or removed. Kept here rather than in the
  // components that show the clip: App mounts with no clips, so StrictMode's extra mount can't
  // revoke a URL that's still in use.
  const videoUrl = clips.video?.url
  const audioUrl = clips.audio?.url
  useEffect(() => revokeOnChange(videoUrl), [videoUrl])
  useEffect(() => revokeOnChange(audioUrl), [audioUrl])

  // The timeline and toolbar are disabled while either runs, so the clips can't change under it.
  const busy = exporting || importing

  useShortcuts({
    enabled: !error && !busy,
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
      onDrop={importFiles}
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
              disabled={busy}
              playing={playing}
              hasClips={!!(clips.video || clips.audio)}
              canExport={!!clips.video}
              autoSync={autoSyncFor(clips, foundSyncOffset)}
              onAutoSync={autoSyncTo}
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
              disabled={busy}
              gliding={gliding}
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
