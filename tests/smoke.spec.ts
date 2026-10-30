import { readFile } from 'node:fs/promises'

import { expect, test, type Locator, type Page } from '@playwright/test'

function fixture(name: string) {
  return new URL(`fixtures/${name}`, import.meta.url).pathname
}

// Shortcuts are ignored while an input has focus, so drop focus before pressing keys.
function blur(page: Page) {
  return page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  )
}

// The timeline opens zoomed out; the test zooms in and sets this to match.
let pixelsPerSecond = 0
function clockToPx(seconds: number) {
  return seconds * pixelsPerSecond
}

async function clockSeconds(page: Page) {
  return Number(await page.getByTestId('playhead').getAttribute('data-time'))
}

// How far a fade dot sits from the clip's edge, in seconds, for polling.
function distance(dot: Locator) {
  return async () => Number(await dot.getAttribute('data-distance'))
}

// Where a clip's trimmed part starts on the timeline, in seconds.
async function clipStart(page: Page, kind: string) {
  const left = await page
    .getByTestId(`clip-${kind}`)
    .evaluate((el) => parseFloat(el.style.left))
  return left / pixelsPerSecond
}

// A clip's trimmed part on the timeline in seconds, as its handles report it.
async function trimSeconds(page: Page, kind = 'video') {
  function time(which: string) {
    return page
      .getByTestId(`clip-${kind}`)
      .getByTestId(`trim-${which}`)
      .getAttribute('data-time')
  }
  return `${await time('start')} – ${await time('end')}`
}

test('import, sync, play, trim and export', async ({ page }) => {
  await page.goto('/')

  // Import both tracks at once, through the file chooser, so a click on Import opens it.
  const chooser = page.waitForEvent('filechooser')
  await page.getByText('Import', { exact: true }).click()
  await (await chooser).setFiles([fixture('clip.mp4'), fixture('tone.wav')])
  const videoClip = page.getByTestId('clip-video')
  const audioClip = page.getByTestId('clip-audio')
  await expect(videoClip.getByRole('img', { name: 'Video' })).toBeVisible()
  await expect(audioClip.getByRole('img', { name: 'Audio' })).toBeVisible()
  await expect(videoClip.locator('canvas')).toBeVisible()
  await expect(audioClip.locator('canvas')).toBeVisible()
  // Zoom in from the zoomed-out start, once there's a clip to zoom.
  const zoomIn = page.getByRole('button', { name: 'Zoom in' })
  for (let i = 0; i < 6; i++) {
    await zoomIn.click()
  }
  pixelsPerSecond = 5 * 1.5 ** 6 // The minimum zoom, six 1.5× steps in

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
  expect(await clipStart(page, 'audio')).toBeCloseTo(1.5, 4)
  expect(await clipStart(page, 'video')).toBe(0)

  // ↑ steps live; Escape puts it back.
  await sync.click()
  await offset.press('ArrowUp')
  await expect.poll(() => clipStart(page, 'audio')).toBeCloseTo(1.501, 4)
  await offset.press('Escape')
  await expect(sync).toContainText('1500 ms ahead of audio')

  // Silence the video's own sound and halve the audio track. Each slider slides out on focus.
  const videoVolume = videoClip.getByRole('slider', { name: 'Volume' })
  await videoVolume.focus()
  await videoVolume.fill('0')
  await expect(videoClip).toContainText('0%')
  const audioVolume = audioClip.getByRole('slider', { name: 'Volume' })
  await audioVolume.focus()
  await audioVolume.fill('0.5')
  await expect(audioClip).toContainText('50%')

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

  // Trim the video to 1–2 s: the end with the keyboard, the start by dragging its handle onto the playhead.
  function trim() {
    return trimSeconds(page)
  }
  const startHandle = videoClip.getByTestId('trim-start')
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
  }) // Close enough to snap
  await page.mouse.up()
  await expect.poll(trim).toBe('1 – 2')
  expect(await clockSeconds(page)).toBe(1) // Dragging a handle doesn't scrub
  // Trimming the start doesn't move the rest of the video, so the sync holds.
  await expect(sync).toContainText('1500 ms ahead of audio')

  // Double-click puts a handle back at the file's edge. Grabbing a handle selects the clip,
  // so deselect it before the arrows, which would otherwise nudge it.
  await videoClip.getByTestId('trim-end').dblclick()
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

  // With the audio selected, the keys trim it instead, leaving the video alone.
  const audioBox = (await audioClip.boundingBox())!
  await page.mouse.click(
    audioBox.x + audioBox.width / 2,
    audioBox.y + audioBox.height / 2,
  )
  await page.keyboard.press('i')
  await expect.poll(() => trimSeconds(page, 'audio')).toBe('2 – 3.5')
  await page.keyboard.press('x')
  await expect.poll(() => trimSeconds(page, 'audio')).toBe('1.5 – 3.5')
  await expect.poll(trim).toBe('1 – 2')
  await page.keyboard.press('Escape')

  // Export and check the file itself.
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

  // Fade the audio in over 0.2 s by dragging its fade-in dot onto the playhead at 1.7 s.
  // Moves the playhead to 1 s plus `frames` frames with the keyboard. Escape first, so the
  // arrows don't nudge the clip a grabbed dot selected.
  async function setPlayhead(frames: number) {
    await blur(page)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+ArrowRight')
    for (let i = 0; i < frames; i++) {
      await page.keyboard.press('ArrowRight')
    }
  }
  // Drags a fade dot `seconds` to the right, onto the playhead.
  async function dragDot(dot: Locator, seconds: number) {
    const dotBox = (await dot.boundingBox())!
    const x = dotBox.x + dotBox.width / 2
    const y = dotBox.y + dotBox.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + clockToPx(seconds) + 2, y, { steps: 5 }) // Close enough to snap
    await page.mouse.up()
  }
  // Frame steps don't add up to round seconds exactly, so the distances are only close.
  await setPlayhead(21)
  const fadeIn = audioClip.getByTestId('fade-start')
  await dragDot(fadeIn, 0.2)
  await expect.poll(distance(fadeIn)).toBeCloseTo(0.2, 6)
  // Double-click clears it.
  await fadeIn.dblclick()
  await expect(fadeIn).toHaveAttribute('data-distance', '0')
  await dragDot(fadeIn, 0.2)
  await expect.poll(distance(fadeIn)).toBeCloseTo(0.2, 6)

  // Its bottom dot moves where it starts, silent before then: onto the playhead at 1.6 s.
  await setPlayhead(18)
  const fadeInStart = audioClip.getByTestId('fade-start-silent')
  await dragDot(fadeInStart, 0.1)
  await expect.poll(distance(fadeInStart)).toBeCloseTo(0.1, 6)
  await expect.poll(distance(fadeIn)).toBeCloseTo(0.2, 6)

  // The audio starts 0.5 s into the export, silent until 0.6 s, then ramps up linearly until 0.7 s.
  const faded = await exportAndAnalyze(page)
  // The peak of the 10 ms from `t`.
  function levelAt(t: number) {
    return faded.levels[Math.round(t / LEVEL_SECONDS)]
  }
  expect(levelAt(0.55)).toBeLessThan(0.03)
  // Up to halfway through, a linear fade reaches ½ (an equal-power one would reach √½).
  expect(Math.abs(levelAt(0.64) - 0.25 * 0.5)).toBeLessThan(0.02)
  expect(Math.abs(levelAt(0.8) - 0.25)).toBeLessThan(0.03)

  // Double-clicking the bottom dot puts the start back at the clip's edge.
  await fadeInStart.dblclick()
  await expect(fadeInStart).toHaveAttribute('data-distance', '0')

  // Remove the audio with its clip's button.
  await audioClip.getByRole('button', { name: 'Remove clip' }).click()
  await expect(audioClip).toHaveCount(0)
  await expect(page.getByTestId('sync')).toHaveCount(0)

  // Remove the video with the keyboard, which brings back the empty timeline.
  await videoClip.click()
  await page.keyboard.press('Delete')
  await expect(videoClip).toHaveCount(0)

  // A file that isn't media, or that only looks like it, shows the error dialog; OK and Esc both close it.
  const dialog = page.getByRole('dialog')
  const importInput = page.locator('input[type=file]')
  await importInput.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a video'),
  })
  await expect(dialog).toContainText(
    '“notes.txt” doesn’t look like a video or audio file',
  )
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toBeHidden()
  await importInput.setInputFiles({
    name: 'notes.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not a video'),
  })
  await expect(dialog).toContainText('Could not read “notes.mp4”')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

/** Exports the project, then decodes the file and measures it. */
async function exportAndAnalyze(page: Page) {
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export MP4' }).click()
  const download = await downloading
  const file = await readFile(await download.path())
  // A fresh tab, so this Mediabunny copy doesn't share a page with the app's.
  const checker = await page.context().newPage()
  await checker.goto('/')
  const result = await checker.evaluate(analyzeExport, file.toString('base64'))
  await checker.close()
  return { name: download.suggestedFilename(), ...result }
}

// The windows `analyzeExport` measures the level of; it runs in the page, so it has its own copy.
const LEVEL_SECONDS = 0.01

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

  // The peak of each 10 ms window, for following how loud it is over time.
  const perLevel = Math.round(sampleRate * 0.01)
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
