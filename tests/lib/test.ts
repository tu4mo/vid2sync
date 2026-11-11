import { test as base, expect } from '@playwright/test'

import { Timeline } from './Timeline.ts'

export { expect }

function fixture(name: string) {
  return new URL(`../fixtures/${name}`, import.meta.url).pathname
}

/** How many times the `timeline` fixture zooms in, so a few pixels of drag is a fine step. */
const ZOOM_IN_STEPS = 6

export const test = base.extend<{ timeline: Timeline }>({
  // The app with the fixture video and audio imported through the file chooser, zoomed in, and
  // nothing focused.
  timeline: async ({ page }, provide) => {
    await page.goto('/')
    const chooser = page.waitForEvent('filechooser')
    await page.getByText('Import', { exact: true }).click()
    await (await chooser).setFiles([fixture('clip.mp4'), fixture('tone.wav')])

    const timeline = new Timeline(page)
    await expect(timeline.clip('video').getByTestId('waveform')).toBeVisible()
    await expect(timeline.clip('audio').getByTestId('waveform')).toBeVisible()
    await expect(page.getByTestId('timeline')).toHaveAttribute(
      'aria-busy',
      'false',
    )

    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    for (let i = 0; i < ZOOM_IN_STEPS; i++) {
      await zoomIn.click()
    }
    await timeline.blur()
    await provide(timeline)
  },
})
