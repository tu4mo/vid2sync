import { expect, test } from './lib/test.ts'

test('dragging a volume line past the bottom stops at 0%', async ({
  timeline,
}) => {
  const video = timeline.clip('video')
  await timeline.dragVolume('video', 2)
  await expect(video.getByTestId('volume')).toHaveAttribute('data-volume', '0')
  await expect(video).toContainText('0%')
})

test('dragging a volume line halfway down halves the volume', async ({
  timeline,
}) => {
  const audio = timeline.clip('audio')
  await timeline.dragVolume('audio', 0.5)
  await expect(audio.getByTestId('volume')).toHaveAttribute(
    'data-volume',
    '0.5',
  )
  await expect(audio).toContainText('50%')
})
