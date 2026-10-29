import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import clipUrl from '../../../tests/fixtures/clip.mp4?url'
import { NO_FADE, type Clip } from '../../lib/media'
import { Video } from './Video'

// The 3 s fixture at 10 s on the timeline, using 0.5–2.5 s of it, so it shows from 10.5 s to 12.5 s.
const clip: Clip = {
  file: new File([], 'clip.mp4'),
  url: clipUrl,
  duration: 3,
  offset: 10,
  trim: { start: 0.5, end: 2.5 },
  fade: NO_FADE,
  buffer: null,
  peaks: null,
}

type Options = {
  shown?: Clip | null
  time?: number
  playing?: boolean
  muted?: boolean
  volume?: number
}

function preview({
  shown = clip,
  time = 11,
  playing = false,
  muted = false,
  volume = 1,
}: Options) {
  return (
    <Video
      clip={shown}
      time={time}
      playing={playing}
      muted={muted}
      volume={volume}
    />
  )
}

async function mount(options: Options = {}) {
  const screen = await render(preview(options))
  const el = screen.container.querySelector('video')
  return { screen, el }
}

/** Waits until the element knows the file's length, so seeks land. */
async function loaded(el: HTMLVideoElement) {
  await expect.poll(() => el.readyState).toBeGreaterThanOrEqual(1)
}

describe('Video', () => {
  it('shows a placeholder without a clip', async () => {
    const { screen, el } = await mount({ shown: null })
    await expect
      .element(screen.getByText('Import a video to preview it here'))
      .toBeVisible()
    expect(el).toBeNull()
  })

  it('shows the video only while the playhead is on its trimmed part', async () => {
    const { screen, el } = await mount({ time: 10.5 })
    await expect.element(el!).toBeVisible()

    await screen.rerender(preview({ time: 12.4 }))
    await expect.element(el!).toBeVisible()

    await screen.rerender(preview({ time: 10.4 }))
    await expect.element(el!).not.toBeVisible()

    await screen.rerender(preview({ time: 12.5 }))
    await expect.element(el!).not.toBeVisible()
  })

  it('parks the video at the playhead', async () => {
    const { screen, el } = await mount({ time: 11 })
    await loaded(el!)
    await screen.rerender(preview({ time: 11.75 }))
    expect(el!.currentTime).toBeCloseTo(1.75)
    expect(el!.paused).toBe(true)
  })

  it('holds the edge frame while the playhead is off the clip', async () => {
    const { screen, el } = await mount({ time: 11 })
    await loaded(el!)
    await screen.rerender(preview({ time: 20 }))
    expect(el!.currentTime).toBeCloseTo(2.5)
  })

  it('plays while playing on the clip, and pauses when stopped', async () => {
    const { screen, el } = await mount({ time: 11, playing: true })
    await expect.poll(() => el!.paused).toBe(false)

    await screen.rerender(preview({ time: 11, playing: false }))
    expect(el!.paused).toBe(true)
  })

  it("doesn't play while the playhead is off the clip", async () => {
    const { el } = await mount({ time: 5, playing: true })
    await loaded(el!)
    expect(el!.paused).toBe(true)
  })

  it('plays its own sound when the audio could not be decoded', async () => {
    const { el } = await mount({ volume: 0.5 })
    expect(el!.muted).toBe(false)
    expect(el!.volume).toBe(0.5)
  })

  it('stays silent when Web Audio plays the sound', async () => {
    const decoded = { ...clip, buffer: {} as AudioBuffer }
    const { el } = await mount({ shown: decoded })
    expect(el!.muted).toBe(true)
  })

  it('follows mute', async () => {
    const { screen, el } = await mount({ muted: true })
    expect(el!.muted).toBe(true)

    await screen.rerender(preview({ muted: false }))
    expect(el!.muted).toBe(false)
  })

  it('caps the volume at full', async () => {
    const { el } = await mount({ volume: 1.5 })
    expect(el!.volume).toBe(1)
  })
})
