import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

/** The length of the windows the export's level is measured over, in seconds. */
const LEVEL_SECONDS = 0.01

/** Exports the project, then decodes the file and measures it. */
export async function exportAndAnalyze(page: Page) {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export MP4' }).click()
  const download = await downloading
  const file = await readFile(await download.path())
  // A fresh tab, so this Mediabunny copy doesn't share a page with the app's.
  const checker = await page.context().newPage()
  await checker.goto('/')
  const result = await checker.evaluate(analyzeExport, {
    base64: file.toString('base64'),
    levelSeconds: LEVEL_SECONDS,
  })
  await checker.close()
  return {
    name: download.suggestedFilename(),
    ...result,
    /** The peak of the audio over the window that starts at `time`. */
    levelAt(time: number) {
      return result.levels[Math.round(time / LEVEL_SECONDS)]
    },
  }
}

type AnalyzeOptions = { base64: string; levelSeconds: number }

/** Runs in the page, so it can't use anything from this module: decodes the exported MP4 with Mediabunny and measures it. */
async function analyzeExport({ base64, levelSeconds }: AnalyzeOptions) {
  const url = '/node_modules/mediabunny/dist/bundles/mediabunny.mjs'
  const mediabunny: typeof import('mediabunny') = await import(url)
  const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  const input = new mediabunny.Input({
    source: new mediabunny.BufferSource(data),
    formats: mediabunny.ALL_FORMATS,
  })

  const videoTracks = await input.getVideoTracks()
  const audioTracks = await input.getAudioTracks()
  // A cut keeps pre-roll back to the previous keyframe, hidden by an edit list (it decodes with
  // negative timestamps), so the visible part runs from 0 to the end.
  const videoDuration = await videoTracks[0].computeDuration()

  // Flatten channel 0 into one timeline-aligned array, starting at t = 0.
  const sampleRate = audioTracks[0].sampleRate
  const samples: number[] = []
  for await (const { buffer, timestamp } of new mediabunny.AudioBufferSink(
    audioTracks[0],
  ).buffers()) {
    const channel = buffer.getChannelData(0)
    const first = Math.round(timestamp * sampleRate)
    for (let i = 0; i < channel.length; i++) {
      if (first + i >= 0) {
        samples[first + i] = channel[i]
      }
    }
  }

  const onsetIndex = samples.findIndex((sample) => Math.abs(sample) > 0.05)
  // Measure a steady 0.3 s window after the onset.
  const window = samples.slice(
    onsetIndex + sampleRate * 0.1,
    onsetIndex + sampleRate * 0.4,
  )
  let crossings = 0
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1] < 0 !== window[i] < 0) {
      crossings++
    }
  }

  // The peak of each window, for following how loud it is over time.
  const perLevel = Math.round(sampleRate * levelSeconds)
  const levels: number[] = []
  for (let i = 0; i < samples.length; i += perLevel) {
    let peak = 0
    for (let j = i; j < Math.min(samples.length, i + perLevel); j++) {
      peak = Math.max(peak, Math.abs(samples[j] ?? 0))
    }
    levels.push(peak)
  }

  return {
    videoTracks: videoTracks.length,
    audioTracks: audioTracks.length,
    videoDuration,
    onset: onsetIndex / sampleRate,
    frequency: crossings / 2 / 0.3,
    peak: Math.max(...window.map(Math.abs)),
    levels,
  }
}
