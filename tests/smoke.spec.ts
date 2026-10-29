import { readFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

const fixture = (name: string) =>
  new URL(`fixtures/${name}`, import.meta.url).pathname

// Shortcuts are ignored while an input has focus, so drop focus before pressing keys.
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

// The timeline opens zoomed out; the test zooms in and sets this to match.
let pixelsPerSecond = 0
const clockToPx = (seconds: number) => seconds * pixelsPerSecond

const clockSeconds = async (page: Page) => {
  const [m, s] = (await page.getByTestId('clock').inputValue()).split(':')
  return Number(m) * 60 + Number(s)
}

// The video's trimmed part on the timeline in seconds, as its handles report it.
const trimSeconds = async (page: Page) => {
  const time = (which: string) =>
    page.getByTestId(`trim-${which}`).getAttribute('data-time')
  return `${await time('start')} – ${await time('end')}`
}

test('import, sync, play, trim and export', async ({ page }) => {
  await page.goto('/')

  // Import both tracks.
  const videoHead = page.getByTestId('head-video')
  const audioHead = page.getByTestId('head-audio')
  const videoLane = page.getByTestId('lane-video')
  const audioLane = page.getByTestId('lane-audio')
  // The video through the file chooser, so a click on Import opens it rather than scrubbing.
  const chooser = page.waitForEvent('filechooser')
  await videoLane.getByText('Import').click()
  await (await chooser).setFiles(fixture('clip.mp4'))
  await audioLane.locator('input[type=file]').setInputFiles(fixture('tone.wav'))
  const videoClip = page.getByTestId('clip-video')
  const audioClip = page.getByTestId('clip-audio')
  await expect(videoClip).toContainText('clip.mp4')
  await expect(audioClip).toContainText('tone.wav')
  await expect(videoClip.locator('canvas')).toBeVisible()
  await expect(audioClip.locator('canvas')).toBeVisible()
  // Zoom in from the zoomed-out start, once there's a clip to zoom.
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  for (let i = 0; i < 6; i++) {
    await zoomIn.click()
  }
  pixelsPerSecond = 5 * 1.5 ** 6 // the minimum zoom, six 1.5× steps in

  // AAC padding makes the file slightly longer than 3 s.
  const videoWidth = (await videoClip.boundingBox())!.width
  expect(videoWidth).toBeGreaterThan(clockToPx(3))
  expect(videoWidth).toBeLessThan(clockToPx(3.1))

  // Sync: drag the audio clip, then set it exactly and nudge with the keyboard.
  const box = (await audioClip.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  const sync = page.getByTestId('sync')
  await expect(sync).toContainText(/^[1-9]\d* ms ahead of audio$/)
  await sync.click()
  const offset = page.getByLabel('Audio offset (ms)')
  await offset.fill('1400')
  await offset.press('Enter')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(sync).toContainText('1500 ms ahead of audio')
  await expect(audioClip).toContainText('@ 0:01.500')
  await expect(videoClip).toContainText('@ 0:00.000')

  // ↑ steps live; Escape puts it back.
  await sync.click()
  await offset.press('ArrowUp')
  await expect(audioClip).toContainText('@ 0:01.501')
  await offset.press('Escape')
  await expect(sync).toContainText('1500 ms ahead of audio')

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
  await expect(play).toHaveAccessibleName('Pause')
  await expect.poll(() => clockSeconds(page)).toBeGreaterThan(0.3)
  await page.keyboard.press('Space')
  await expect(play).toHaveAccessibleName('Play')
  const paused = await clockSeconds(page)
  await page.waitForTimeout(200)
  expect(await clockSeconds(page)).toBe(paused)

  // Type a time into the playhead to jump there; Escape leaves it where it was.
  const clockField = page.getByTestId('clock')
  await clockField.click()
  await clockField.fill('1.5')
  await clockField.press('Enter')
  expect(await clockSeconds(page)).toBe(1.5)
  await clockField.click()
  await clockField.fill('0:00.250')
  await clockField.press('Escape')
  expect(await clockSeconds(page)).toBe(1.5)

  // Trim the video to 1–2 s: the end with the keyboard, the start by dragging its handle onto the playhead.
  const trim = () => trimSeconds(page)
  const startHandle = page.getByTestId('trim-start')
  await expect.poll(trim).toMatch(/^0 – 3\.0\d*$/)
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('o')
  await expect.poll(trim).toBe('0 – 2')
  await page.keyboard.press('Shift+ArrowLeft')
  const handle = (await startHandle.boundingBox())!
  const playhead = handle.x + clockToPx(await clockSeconds(page))
  await page.mouse.move(handle.x + 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(playhead + 3, handle.y + handle.height / 2, {
    steps: 5,
  }) // close enough to snap
  await page.mouse.up()
  await expect.poll(trim).toBe('1 – 2')
  expect(await clockSeconds(page)).toBe(1) // dragging a handle doesn't scrub
  // Trimming the start doesn't move the rest of the video, so the sync holds.
  await expect(sync).toContainText('1500 ms ahead of audio')
  await expect(videoClip).toContainText('@ 0:01.000')

  // Double-click puts a handle back at the file's edge. Grabbing a handle selects the clip,
  // so deselect it before the arrows, which would otherwise nudge it.
  await page.getByTestId('trim-end').dblclick()
  await expect.poll(trim).toMatch(/^1 – 3\.0\d*$/)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('o')
  await expect.poll(trim).toBe('1 – 2')

  // Shift turns snapping off.
  await page.keyboard.press('Shift+ArrowLeft')
  const start = (await startHandle.boundingBox())!
  await page.mouse.move(start.x + 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.keyboard.down('Shift')
  await page.mouse.move(
    start.x + 2 + clockToPx(0.06),
    start.y + start.height / 2,
    {
      steps: 5,
    },
  )
  await page.keyboard.up('Shift')
  await page.mouse.up()
  await expect.poll(trim).toBe('1.06 – 2')

  // X resets both ends; I and O set them at the playhead.
  await page.keyboard.press('Escape')
  await page.keyboard.press('x')
  await expect.poll(trim).toMatch(/^0 – 3\.0\d*$/)
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('i')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('o')
  await expect.poll(trim).toBe('1 – 2')

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
  // Trimmed, frame-exact.
  expect(result.videoDuration).toBeCloseTo(1, 2)
  // Audio sits at 1.5 s on the timeline, the trimmed video starts at 1 s → it starts 0.5 s in.
  expect(Math.abs(result.onset - 0.5)).toBeLessThan(0.005)
  // Only the WAV's 880 Hz tone: the video's 440 Hz sound is muted.
  expect(Math.abs(result.frequency - 880)).toBeLessThan(10)
  // The WAV is at 0.5, the track volume at 50%.
  expect(Math.abs(result.peak - 0.25)).toBeLessThan(0.03)

  // Remove the audio from its track head.
  await audioHead.getByRole('button', { name: 'Remove clip' }).click()
  await expect(audioClip).toHaveCount(0)
  await expect(page.getByTestId('sync')).toHaveCount(0)

  // A file that isn't media shows the error dialog; OK and Esc both close it.
  const notMedia = {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a video'),
  }
  const dialog = page.getByRole('dialog')
  await audioLane.locator('input[type=file]').setInputFiles(notMedia)
  await expect(dialog).toContainText('Could not read “notes.txt”')
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toBeHidden()
  await audioLane.locator('input[type=file]').setInputFiles(notMedia)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

/** Runs in the page: decodes the exported MP4 with Mediabunny and measures it. */
async function analyzeExport(base64: string) {
  const url = '/node_modules/mediabunny/dist/bundles/mediabunny.mjs'
  const mb: typeof import('mediabunny') = await import(url)
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const input = new mb.Input({
    source: new mb.BufferSource(data),
    formats: mb.ALL_FORMATS,
  })

  const videoTracks = await input.getVideoTracks()
  const audioTracks = await input.getAudioTracks()
  // The cut at 1 s keeps pre-roll back to the previous keyframe, hidden by an edit list
  // (it decodes with negative timestamps), so the visible part runs from 0 to the end.
  const videoDuration = await videoTracks[0].computeDuration()

  // Flatten channel 0 into one timeline-aligned array, starting at t = 0.
  const sampleRate = audioTracks[0].sampleRate
  const samples: number[] = []
  for await (const { buffer, timestamp } of new mb.AudioBufferSink(
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

  const onsetIndex = samples.findIndex((v) => Math.abs(v) > 0.05)
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

  return {
    videoTracks: videoTracks.length,
    audioTracks: audioTracks.length,
    videoDuration,
    onset: onsetIndex / sampleRate,
    frequency: crossings / 2 / 0.3,
    peak: Math.max(...window.map(Math.abs)),
  }
}
