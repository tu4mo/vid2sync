import { expect, test } from './lib/test.ts'

// The video untrimmed: AAC padding makes the file slightly longer than 3 s.
const UNTRIMMED = /^0 – 3\.0\d*$/

test('O trims the end at the playhead, and a start handle dragged near it snaps on', async ({
  page,
  timeline,
}) => {
  await timeline.setOffset(1500)
  await expect.poll(() => timeline.trimSeconds()).toMatch(UNTRIMMED)
  await timeline.movePlayhead(2)
  await page.keyboard.press('o')
  await expect.poll(() => timeline.trimSeconds()).toBe('0 – 2')

  await page.keyboard.press('Shift+ArrowLeft')
  const startHandle = timeline.clip('video').getByTestId('trim-start')
  await timeline.dragBy(startHandle, { seconds: 1, snap: true })
  await expect.poll(() => timeline.trimSeconds()).toBe('1 – 2')
  expect(await timeline.playheadSeconds()).toBe(1) // Dragging a handle doesn't scrub
  // Trimming the start doesn't move the rest of the video, so the sync holds.
  await expect(timeline.sync).toContainText('1500 ms ahead of audio')
})

test('double-clicking a handle puts it back at the file’s edge', async ({
  page,
  timeline,
}) => {
  await timeline.movePlayhead(2)
  await page.keyboard.press('o')
  await expect.poll(() => timeline.trimSeconds()).toBe('0 – 2')
  await timeline.clip('video').getByTestId('trim-end').dblclick()
  await expect.poll(() => timeline.trimSeconds()).toMatch(UNTRIMMED)
})

test('Shift turns snapping off', async ({ page, timeline }) => {
  await timeline.movePlayhead(1)
  await page.keyboard.press('i')
  await expect.poll(() => timeline.trimSeconds()).toMatch(/^1 – 3\.0\d*$/)
  // 0.06 s from the playhead, which would snap back onto it without Shift.
  const startHandle = timeline.clip('video').getByTestId('trim-start')
  await timeline.dragBy(startHandle, { seconds: 0.06, shift: true })
  await expect.poll(() => timeline.trimSeconds()).toMatch(/^1\.06 – 3\.0\d*$/)
})

test('I and O trim at the playhead; X resets both ends', async ({
  page,
  timeline,
}) => {
  await timeline.movePlayhead(1)
  await page.keyboard.press('i')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('o')
  await expect.poll(() => timeline.trimSeconds()).toBe('1 – 2')
  await page.keyboard.press('x')
  await expect.poll(() => timeline.trimSeconds()).toMatch(UNTRIMMED)
})

test('with the audio selected, the keys trim it instead, leaving the video alone', async ({
  page,
  timeline,
}) => {
  await timeline.setOffset(1500)
  await timeline.movePlayhead(2)
  await timeline.clip('audio').click()
  await page.keyboard.press('i')
  await expect.poll(() => timeline.trimSeconds('audio')).toBe('2 – 3.5')
  await page.keyboard.press('x')
  await expect.poll(() => timeline.trimSeconds('audio')).toBe('1.5 – 3.5')
  await expect.poll(() => timeline.trimSeconds()).toMatch(UNTRIMMED)
})
