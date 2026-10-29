import { describe, expect, it, vi } from 'vitest'

import { NO_FADE, type Clip } from '../../lib/media'
import { syncVideo } from './sync'

class FakeVideo {
  currentTime = 0
  playbackRate = 1
  paused = true
  play = vi.fn(async () => {
    this.paused = false
  })
  pause = vi.fn(() => {
    this.paused = true
  })
}

function video(currentTime: number, paused = true) {
  const el = new FakeVideo()
  el.currentTime = currentTime
  el.paused = paused
  return el
}

function element(el: FakeVideo) {
  return el as unknown as HTMLVideoElement
}

// Sits at 10 s on the timeline, using 2–8 s of the file.
const clip: Clip = {
  file: new File([], 'clip'),
  url: 'blob:clip',
  duration: 10,
  offset: 10,
  trim: { start: 2, end: 8 },
  fade: NO_FADE,
  buffer: null,
  peaks: null,
}

describe('syncVideo when parked', () => {
  it('seeks to the playhead', () => {
    const el = video(0)
    syncVideo(element(el), clip, 15, false)
    expect(el.currentTime).toBe(5)
  })

  it('pauses a playing video and resets its rate', () => {
    const el = video(5, false)
    el.playbackRate = 1.05
    syncVideo(element(el), clip, 15, false)
    expect(el.pause).toHaveBeenCalledOnce()
    expect(el.playbackRate).toBe(1)
  })

  it('leaves a paused video alone', () => {
    const el = video(5)
    syncVideo(element(el), clip, 15, false)
    expect(el.pause).not.toHaveBeenCalled()
  })

  it('clamps to the trimmed part', () => {
    const before = video(5)
    syncVideo(element(before), clip, 0, false)
    expect(before.currentTime).toBe(2)

    const after = video(5)
    syncVideo(element(after), clip, 30, false)
    expect(after.currentTime).toBe(8)
  })

  it("doesn't seek for a tiny difference", () => {
    const el = video(5.004)
    syncVideo(element(el), clip, 15, false)
    expect(el.currentTime).toBe(5.004)
  })
})

describe('syncVideo when playing', () => {
  it('starts a paused video', () => {
    const el = video(5)
    syncVideo(element(el), clip, 15, true)
    expect(el.play).toHaveBeenCalledOnce()
  })

  it("doesn't restart a playing video", () => {
    const el = video(5, false)
    syncVideo(element(el), clip, 15, true)
    expect(el.play).not.toHaveBeenCalled()
  })

  it('swallows a rejected play', async () => {
    const el = video(5)
    el.play.mockRejectedValueOnce(new Error('NotAllowedError'))
    expect(() => syncVideo(element(el), clip, 15, true)).not.toThrow()
    await Promise.resolve()
  })

  it('plays at normal rate when in step', () => {
    const el = video(5, false)
    el.playbackRate = 1.05
    syncVideo(element(el), clip, 15, true)
    expect(el.playbackRate).toBe(1)
    expect(el.currentTime).toBe(5)
  })

  it('slows down when ahead and speeds up when behind', () => {
    const ahead = video(5.02, false)
    syncVideo(element(ahead), clip, 15, true)
    expect(ahead.playbackRate).toBeCloseTo(0.96)

    const behind = video(4.98, false)
    syncVideo(element(behind), clip, 15, true)
    expect(behind.playbackRate).toBeCloseTo(1.04)
  })

  it('caps the rate nudge at ±10%', () => {
    const ahead = video(5.2, false)
    syncVideo(element(ahead), clip, 15, true)
    expect(ahead.playbackRate).toBe(0.9)

    const behind = video(4.8, false)
    syncVideo(element(behind), clip, 15, true)
    expect(behind.playbackRate).toBe(1.1)
  })

  it('seeks on a big jump instead of nudging', () => {
    const el = video(1, false)
    syncVideo(element(el), clip, 15, true)
    expect(el.currentTime).toBe(5)
    expect(el.playbackRate).toBe(1)
  })
})
