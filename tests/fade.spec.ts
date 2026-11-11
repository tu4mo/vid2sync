import { expect, test } from './lib/test.ts'

test('dragging the fade-in dot onto the playhead fades in; double-click clears it', async ({
  timeline,
}) => {
  // The audio starts at 1.5 s; 21 frames past 1 s is 1.7 s, 0.2 s in.
  await timeline.setOffset(1500)
  await timeline.movePlayhead(1, 21)
  const fadeIn = timeline.clip('audio').getByTestId('fade-start')
  await timeline.dragBy(fadeIn, { seconds: 0.2, snap: true })
  await expect.poll(() => timeline.fadeDistance(fadeIn)).toBeCloseTo(0.2, 6)
  await fadeIn.dblclick()
  await expect(fadeIn).toHaveAttribute('data-distance', '0')
})

test('the fade’s bottom dot moves where it starts; double-click puts it back', async ({
  timeline,
}) => {
  await timeline.setOffset(1500)
  await timeline.fadeAudioIn()
  const audio = timeline.clip('audio')
  const fadeIn = audio.getByTestId('fade-start')
  const fadeInStart = audio.getByTestId('fade-start-silent')
  // The bottom dot moved 0.1 s in, leaving the top of the fade where it was.
  await expect
    .poll(() => timeline.fadeDistance(fadeInStart))
    .toBeCloseTo(0.1, 6)
  await expect.poll(() => timeline.fadeDistance(fadeIn)).toBeCloseTo(0.2, 6)

  await fadeInStart.dblclick()
  await expect(fadeInStart).toHaveAttribute('data-distance', '0')
})
