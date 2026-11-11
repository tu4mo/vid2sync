import { expect, test } from './lib/test.ts'

test('Space plays, and pauses the clock where it is', async ({
  page,
  timeline,
}) => {
  const play = page.getByRole('button', { name: /^(Play|Pause)$/ })
  await page.keyboard.press('Space')
  await expect(play).toHaveAccessibleName('Pause')
  await expect.poll(() => timeline.playheadSeconds()).toBeGreaterThan(0.3)
  await page.keyboard.press('Space')
  await expect(play).toHaveAccessibleName('Play')
  const paused = await timeline.playheadSeconds()
  await page.waitForTimeout(200)
  expect(await timeline.playheadSeconds()).toBe(paused)
})
