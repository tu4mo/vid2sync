import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const fixture = (name: string) => new URL(`fixtures/${name}`, import.meta.url).pathname

// Shortcuts are ignored while an input has focus, so drop focus before pressing keys.
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

const clockSeconds = async (page: Page) => {
  const [m, s] = (await page.getByTestId('clock').innerText()).split(' ')[0].split(':')
  return Number(m) * 60 + Number(s)
}

test('import, sync, play, set range and export', async ({ page }) => {
  await page.goto("/")

  // Import both tracks.
  const videoHead = page.getByTestId('head-video')
  const audioHead = page.getByTestId('head-audio')
  await videoHead.locator('input[type=file]').setInputFiles(fixture('clip.mp4'))
  await audioHead.locator('input[type=file]').setInputFiles(fixture('tone.wav'))
  const videoClip = page.getByTestId('clip-video')
  const audioClip = page.getByTestId('clip-audio')
  await expect(videoClip).toContainText('clip.mp4')
  await expect(audioClip).toContainText('tone.wav')
  await expect(videoClip.locator('canvas')).toBeVisible()
  await expect(audioClip.locator('canvas')).toBeVisible()
  await expect(page.getByTestId('clock')).toContainText(/\/ 0:03\.\d{3}/) // AAC padding makes the file slightly longer than 3 s

  // Sync: drag the audio clip, then set it exactly and nudge with the keyboard.
  const box = (await audioClip.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  const start = page.getByLabel('Start (ms)')
  expect(Number(await start.inputValue())).toBeGreaterThan(0)
  await start.fill('1400')
  await blur(page)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(start).toHaveValue('1500')
  await expect(page.getByTestId('sync')).toContainText('+1500 ms')
  await expect(videoClip).toContainText('@ 0:00.000')

  // Mute the video's own sound and halve the audio track.
  const mute = videoHead.getByRole('button', { name: 'Mute' })
  await mute.click()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await audioHead.getByRole('slider').fill('0.5')
  await expect(audioHead).toContainText('50%')

  // Play, let the clock run, pause.
  await blur(page)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Home')
  const play = page.getByRole('button', { name: /^(Play|Pause)$/ })
  await page.keyboard.press('Space')
  await expect(play).toHaveText('Pause')
  await expect.poll(() => clockSeconds(page)).toBeGreaterThan(0.3)
  await page.keyboard.press('Space')
  await expect(play).toHaveText('Play')
  const paused = await clockSeconds(page)
  await page.waitForTimeout(200)
  expect(await clockSeconds(page)).toBe(paused)

  // Export range 1–2 s.
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('i')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('o')
  await expect(page.getByTestId('range')).toContainText('0:01.000 – 0:02.000')

  // Export and check the file itself.
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export MP4' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('clip-synced.mp4')
  const file = await readFile(await download.path())
  // A fresh tab, so this Mediabunny copy doesn't share a page with the app's.
  const checker = await page.context().newPage()
  await checker.goto('/')
  const result = await checker.evaluate(analyzeExport, file.toString('base64'))

  expect(result.videoTracks).toBe(1)
  expect(result.audioTracks).toBe(1)
  // Trimmed to the range, frame-exact.
  expect(result.videoDuration).toBeCloseTo(1, 2)
  // Audio sits at 1.5 s on the timeline, the range starts at 1 s → it starts 0.5 s in.
  expect(Math.abs(result.onset - 0.5)).toBeLessThan(0.005)
  // Only the WAV's 880 Hz tone: the video's 440 Hz sound is muted.
  expect(Math.abs(result.frequency - 880)).toBeLessThan(10)
  // The WAV is at 0.5, the track volume at 50%.
  expect(Math.abs(result.peak - 0.25)).toBeLessThan(0.03)
})

/** Runs in the page: decodes the exported MP4 with Mediabunny and measures it. */
async function analyzeExport(base64: string) {
  const url = '/node_modules/mediabunny/dist/bundles/mediabunny.mjs'
  const mb: typeof import('mediabunny') = await import(url)
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const input = new mb.Input({ source: new mb.BufferSource(data), formats: mb.ALL_FORMATS })

  const videoTracks = await input.getVideoTracks()
  const audioTracks = await input.getAudioTracks()
  // The cut at 1 s keeps pre-roll back to the previous keyframe, hidden by an edit list
  // (it decodes with negative timestamps), so the visible part runs from 0 to the end.
  const videoDuration = await videoTracks[0].computeDuration()

  // Flatten channel 0 into one timeline-aligned array, starting at t = 0.
  const sampleRate = audioTracks[0].sampleRate
  const samples: number[] = []
  for await (const { buffer, timestamp } of new mb.AudioBufferSink(audioTracks[0]).buffers()) {
    const channel = buffer.getChannelData(0)
    const first = Math.round(timestamp * sampleRate)
    for (let i = 0; i < channel.length; i++) if (first + i >= 0) samples[first + i] = channel[i]
  }

  const onsetIndex = samples.findIndex((v) => Math.abs(v) > 0.05)
  // Measure a steady 0.3 s window after the onset.
  const window = samples.slice(onsetIndex + sampleRate * 0.1, onsetIndex + sampleRate * 0.4)
  let crossings = 0
  for (let i = 1; i < window.length; i++) if (window[i - 1] < 0 !== window[i] < 0) crossings++

  return {
    videoTracks: videoTracks.length,
    audioTracks: audioTracks.length,
    videoDuration,
    onset: onsetIndex / sampleRate,
    frequency: crossings / 2 / 0.3,
    peak: Math.max(...window.map(Math.abs)),
  }
}
