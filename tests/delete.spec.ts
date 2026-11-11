import { expect, test } from './lib/test.ts'

test('Delete removes the selected clip, and removing both empties the timeline', async ({
  page,
  timeline,
}) => {
  await timeline.clip('audio').click()
  await page.keyboard.press('Delete')
  await expect(timeline.clip('audio')).toHaveCount(0)
  await expect(timeline.sync).toHaveCount(0)

  await timeline.clip('video').click()
  await page.keyboard.press('Delete')
  await expect(timeline.clip('video')).toHaveCount(0)
  await expect(page.getByText('a video and an audio file')).toBeVisible()
})
