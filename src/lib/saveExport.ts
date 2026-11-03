import type { Clips, Volumes } from './clip'

/**
 * Exports the synced video and downloads it, named after the video file. Loads the exporter
 * on first use, so Mediabunny stays out of the initial bundle.
 */
export async function saveExport(clips: Clips, volume: Volumes) {
  if (!clips.video) {
    return
  }
  const { downloadBlob, exportSynced } = await import('./export')
  const blob = await exportSynced(clips, volume)
  const name = clips.video.file.name.replace(/\.[^.]+$/, '')
  downloadBlob(blob, `${name}-synced.mp4`)
}
