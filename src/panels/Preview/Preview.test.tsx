import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import clipUrl from '../../../tests/fixtures/clip.mp4?url'
import { type Clip } from '../../lib/clip'
import { testClip } from '../../test/testClip'
import { Preview } from './Preview'

// The 3 s fixture at 10 s on the timeline, using 0.5–2.5 s of it, so it shows from 10.5 s to 12.5 s.
const clip = testClip({
  url: clipUrl,
  duration: 3,
  offset: 10,
  trim: { start: 0.5, end: 2.5 },
})

type Options = {
  shown?: Clip | null
  time?: number
  playing?: boolean
  volume?: number
}

function preview({
  shown = clip,
  time = 11,
  playing = false,
  volume = 1,
}: Options) {
  return <Preview clip={shown} time={time} playing={playing} volume={volume} />
}

async function mount(options: Options = {}) {
  const screen = await render(preview(options))
  const video = screen.container.querySelector('video')
  return { screen, video }
}

/** Waits until the element knows the file's length, so seeks land. */
async function loaded(video: HTMLVideoElement) {
  await expect.poll(() => video.readyState).toBeGreaterThanOrEqual(1)
}

describe('Preview', () => {
  it('shows the logo instead of a video without a clip', async () => {
    const { screen, video } = await mount({ shown: null })
    expect(video).toBeNull()
    await expect
      .element(screen.getByRole('heading', { name: 'vid2sync' }))
      .toBeVisible()
  })

  it('shows the video only while the playhead is on its trimmed part', async () => {
    const { screen, video } = await mount({ time: 10.5 })
    await expect.element(video!).toBeVisible()

    await screen.rerender(preview({ time: 12.4 }))
    await expect.element(video!).toBeVisible()

    await screen.rerender(preview({ time: 10.4 }))
    await expect.element(video!).not.toBeVisible()

    await screen.rerender(preview({ time: 12.5 }))
    await expect.element(video!).not.toBeVisible()
  })

  it('parks the video at the playhead', async () => {
    const { screen, video } = await mount({ time: 11 })
    await loaded(video!)
    await screen.rerender(preview({ time: 11.75 }))
    expect(video!.currentTime).toBeCloseTo(1.75)
    expect(video!.paused).toBe(true)
  })

  it('holds the edge frame while the playhead is off the clip', async () => {
    const { screen, video } = await mount({ time: 11 })
    await loaded(video!)
    await screen.rerender(preview({ time: 20 }))
    expect(video!.currentTime).toBeCloseTo(2.5)
  })

  it('plays while playing on the clip, and pauses when stopped', async () => {
    const { screen, video } = await mount({ time: 11, playing: true })
    await expect.poll(() => video!.paused).toBe(false)

    await screen.rerender(preview({ time: 11, playing: false }))
    expect(video!.paused).toBe(true)
  })

  it("doesn't play while the playhead is off the clip", async () => {
    const { video } = await mount({ time: 5, playing: true })
    await loaded(video!)
    expect(video!.paused).toBe(true)
  })

  it('plays its own sound when the audio could not be decoded', async () => {
    const { video } = await mount({ volume: 0.5 })
    expect(video!.muted).toBe(false)
    expect(video!.volume).toBe(0.5)
  })

  it('stays silent when Web Audio plays the sound', async () => {
    const decoded = { ...clip, buffer: {} as AudioBuffer }
    const { video } = await mount({ shown: decoded })
    expect(video!.muted).toBe(true)
  })

  it('caps the volume at full', async () => {
    const { video } = await mount({ volume: 1.5 })
    expect(video!.volume).toBe(1)
  })
})
