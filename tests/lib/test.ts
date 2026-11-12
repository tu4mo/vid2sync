import { test as base, expect } from '@playwright/test'

import { Timeline } from './Timeline.ts'

export { expect }

function fixture(name: string) {
  return new URL(`../fixtures/${name}`, import.meta.url).pathname
}

/** The zoom level the `timeline` fixture sets (50 px/s), so a few pixels of drag is a fine step. */
const ZOOM = 10

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
    await expect(timeline.region).toHaveAttribute('aria-busy', 'false')

    await page.getByRole('slider', { name: 'Zoom' }).fill(String(ZOOM))
    await timeline.blur()
    await provide(timeline)
  },
})
