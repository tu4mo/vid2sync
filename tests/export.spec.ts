import { exportAndAnalyze } from './lib/analyzeExport.ts'
import { expect, test } from './lib/test.ts'
import type { Timeline } from './lib/Timeline.ts'

// Audio 1.5 s ahead and at 50%, the video's own sound at 0%, and the video trimmed to 1–2 s.
async function syncMixAndTrim(timeline: Timeline) {
  await timeline.setOffset(1500)
  await timeline.dragVolume('video', 2)
  await timeline.dragVolume('audio', 0.5)
  await timeline.trimVideo(1, 2)
  await expect.poll(() => timeline.trimSeconds()).toBe('1 – 2')
}

test('exports the trimmed video with the synced audio, mixed', async ({
  page,
  timeline,
}) => {
  await syncMixAndTrim(timeline)
  const result = await exportAndAnalyze(page)
  expect(result.name).toBe('clip-synced.mp4')
  expect(result.videoTracks).toBe(1)
  expect(result.audioTracks).toBe(1)
  // Trimmed, frame-exact.
  expect(result.videoDuration).toBeCloseTo(1, 2)
  // Audio sits at 1.5 s on the timeline, the trimmed video starts at 1 s → it starts 0.5 s in.
  expect(Math.abs(result.onset - 0.5)).toBeLessThan(0.005)
  // Only the WAV's 880 Hz tone: the video's 440 Hz sound is at 0%.
  expect(Math.abs(result.frequency - 880)).toBeLessThan(10)
  // The WAV is at 0.5, the track volume at 50%.
  expect(Math.abs(result.peak - 0.25)).toBeLessThan(0.03)
})

test('exports a fade-in as a linear ramp, silent before it starts', async ({
  page,
  timeline,
}) => {
  await syncMixAndTrim(timeline)
  await timeline.fadeAudioIn()
  await page.keyboard.press('Escape')

  // The audio starts 0.5 s into the export, silent until 0.6 s, then ramps up until 0.7 s.
  const result = await exportAndAnalyze(page)
  expect(result.levelAt(0.55)).toBeLessThan(0.03)
  // Halfway through, a linear fade reaches ½ (an equal-power one would reach √½).
  expect(Math.abs(result.levelAt(0.64) - 0.25 * 0.5)).toBeLessThan(0.02)
  expect(Math.abs(result.levelAt(0.8) - 0.25)).toBeLessThan(0.03)
})
