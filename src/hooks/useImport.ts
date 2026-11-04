import { useState } from 'react'

import { findClipsSync } from '../lib/autoSync'
import { roundMs, type Clips } from '../lib/clip'
import { errorMessage } from '../lib/error'
import { loadClip, routeFiles } from '../lib/media'

/** Resolves once the browser has painted what's been rendered so far. */
function afterPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve))
  })
}

type Options = {
  ctx: AudioContext
  /**
   * The clips the batch joins. They can't change while it loads, since the timeline, toolbar and
   * shortcuts are disabled meanwhile.
   */
  clips: Clips
  /** Pauses playback and returns where the playhead stopped, where the new clips start. */
  pause: () => number
  /** Called once per batch that loaded at least one clip, with the clips it joins them to. */
  onLoad: (clips: Clips) => void
  /** Called after `onLoad` with the sync offset auto-sync found, or null when it couldn't sync the clips. */
  onSync: (syncOffset: number | null) => void
  /** Called with why a file was left out or failed to load, or null to clear the last error. */
  onError: (message: string | null) => void
}

/**
 * Loads dropped or chosen files onto the tracks their types belong on, one batch at a time, then
 * matches the clips by their sound.
 */
export function useImport({
  ctx,
  clips,
  pause,
  onLoad,
  onSync,
  onError,
}: Options) {
  const [importing, setImporting] = useState(false)

  async function load(files: File[]) {
    const routes = routeFiles(files)
    // Set before the imports start, so a failed import's error replaces it rather than the reverse.
    onError(routes.error)
    if (routes.imports.length === 0) {
      return
    }
    const offset = roundMs(pause())
    setImporting(true)
    const results = await Promise.allSettled(
      routes.imports.map(({ file, kind }) => loadClip(file, kind, ctx)),
    )
    let next = clips
    routes.imports.forEach(({ kind }, i) => {
      const result = results[i]
      if (result.status === 'fulfilled') {
        next = { ...next, [kind]: { ...result.value, offset } }
      } else {
        onError(errorMessage(result.reason))
      }
    })
    // Unless every file failed.
    if (next !== clips) {
      onLoad(next)
      // Let the clips show where they landed first, so syncing them is seen to move them.
      await afterPaint()
      onSync(findClipsSync(next))
    }
    setImporting(false)
  }

  function importFiles(files: File[]) {
    void load(files)
  }

  return { importing, importFiles }
}
