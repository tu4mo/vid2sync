import { expect, test } from './lib/test.ts'

test('dragging the audio clip moves it ahead of the video', async ({
  timeline,
}) => {
  await timeline.dragBy(timeline.clip('audio'), { seconds: 1 })
  await expect(timeline.sync).toContainText(/^[1-9]\d* ms ahead of audio$/)
  expect(await timeline.clipStart('video')).toBe(0)
})

test('the offset can be typed, then nudged with Shift+arrow', async ({
  page,
  timeline,
}) => {
  await timeline.clip('audio').click() // Nudges move the selected clip
  await timeline.setOffset(1400)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(timeline.sync).toContainText('1500 ms ahead of audio')
  expect(await timeline.clipStart('audio')).toBeCloseTo(1.5, 4)
  expect(await timeline.clipStart('video')).toBe(0)
})

test('↑ in the offset field steps live; Escape puts it back', async ({
  timeline,
}) => {
  await timeline.setOffset(1500)
  await timeline.sync.click()
  await timeline.offsetField.press('ArrowUp')
  await expect.poll(() => timeline.clipStart('audio')).toBeCloseTo(1.501, 4)
  await timeline.offsetField.press('Escape')
  await expect(timeline.sync).toContainText('1500 ms ahead of audio')
  expect(await timeline.clipStart('audio')).toBeCloseTo(1.5, 4)
})
