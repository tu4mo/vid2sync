import { expect, test } from './lib/test.ts'

test('Ctrl + wheel zooms around the cursor', async ({ timeline, page }) => {
  const clip = timeline.clip('video')
  const before = await clip.boundingBox()
  if (!before) {
    throw new Error('The video clip has no box')
  }
  const cursorX = before.x + before.width / 2
  const cursorY = before.y + before.height / 2
  const pixelsPerSecond = await timeline.pixelsPerSecond()

  await page.mouse.move(cursorX, cursorY)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')

  await expect
    .poll(() => timeline.pixelsPerSecond())
    .toBeGreaterThan(pixelsPerSecond)
  const factor = (await timeline.pixelsPerSecond()) / pixelsPerSecond
  const after = await clip.boundingBox()
  // The point under the cursor stays put, so the clip's start moves away from it by the zoom,
  // give or take the scroll position rounding to whole pixels.
  const expected = cursorX - (cursorX - before.x) * factor
  expect(Math.abs((after?.x ?? 0) - expected)).toBeLessThan(2)
})
