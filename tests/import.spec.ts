import type { Page } from '@playwright/test'

import { expect, test } from './lib/test.ts'

// The `timeline` fixture's import already waits for both clips' waveforms.
test('shows a thumbnail for each clip', async ({ page, timeline }) => {
  await expect(timeline.clip('video')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Video' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Audio' })).toBeVisible()
})

test('sizes the video clip to its duration', async ({ timeline }) => {
  // AAC padding makes the file slightly longer than 3 s.
  const width = (await timeline.clip('video').boundingBox())!.width
  expect(width).toBeGreaterThan(await timeline.toPx(3))
  expect(width).toBeLessThan(await timeline.toPx(3.1))
})

test('says why auto-sync can’t match steady tones, and moves nothing', async ({
  page,
  timeline,
}) => {
  const autoSync = page.getByTestId('auto-sync')
  await expect(autoSync).toHaveAttribute(
    'title',
    'Couldn’t sync the clips automatically',
  )
  await expect(autoSync).toBeDisabled()
  expect(await timeline.clipStart('audio')).toBe(0)
})

/** Opens the app and imports a small text file under `name`, with no media in it. */
async function importNotMedia(page: Page, name: string, mimeType: string) {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType,
    buffer: Buffer.from('not a video'),
  })
}

test('shows an error for a file that isn’t media; OK closes it', async ({
  page,
}) => {
  await importNotMedia(page, 'notes.txt', 'text/plain')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(
    '“notes.txt” doesn’t look like a video or audio file',
  )
  await dialog.getByRole('button', { name: 'OK' }).click()
  await expect(dialog).toBeHidden()
})

test('shows an error for a file that only looks like media; Escape closes it', async ({
  page,
}) => {
  await importNotMedia(page, 'notes.mp4', 'video/mp4')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Could not read “notes.mp4”')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
