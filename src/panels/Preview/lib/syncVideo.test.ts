import { describe, expect, it, vi } from 'vitest'

import { testClip } from '../../../test/testClip'
import { syncVideo } from './syncVideo'

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

function fakeVideo(currentTime: number, paused = true) {
  const video = new FakeVideo()
  video.currentTime = currentTime
  video.paused = paused
  return video
}

function asVideoElement(video: FakeVideo) {
  return video as unknown as HTMLVideoElement
}

// Sits at 10 s on the timeline, using 2–8 s of the file.
const clip = testClip({ offset: 10, trim: { start: 2, end: 8 } })

describe('syncVideo when parked', () => {
  it('seeks to the playhead', () => {
    const video = fakeVideo(0)
    syncVideo(asVideoElement(video), clip, 15, false)
    expect(video.currentTime).toBe(5)
  })

  it('pauses a playing video and resets its rate', () => {
    const video = fakeVideo(5, false)
    video.playbackRate = 1.05
    syncVideo(asVideoElement(video), clip, 15, false)
    expect(video.pause).toHaveBeenCalledOnce()
    expect(video.playbackRate).toBe(1)
  })

  it('leaves a paused video alone', () => {
    const video = fakeVideo(5)
    syncVideo(asVideoElement(video), clip, 15, false)
    expect(video.pause).not.toHaveBeenCalled()
  })

  it('clamps to the trimmed part', () => {
    const before = fakeVideo(5)
    syncVideo(asVideoElement(before), clip, 0, false)
    expect(before.currentTime).toBe(2)

    const after = fakeVideo(5)
    syncVideo(asVideoElement(after), clip, 30, false)
    expect(after.currentTime).toBe(8)
  })

  it("doesn't seek for a tiny difference", () => {
    const video = fakeVideo(5.004)
    syncVideo(asVideoElement(video), clip, 15, false)
    expect(video.currentTime).toBe(5.004)
  })
})

describe('syncVideo when playing', () => {
  it('starts a paused video', () => {
    const video = fakeVideo(5)
    syncVideo(asVideoElement(video), clip, 15, true)
    expect(video.play).toHaveBeenCalledOnce()
  })

  it("doesn't restart a playing video", () => {
    const video = fakeVideo(5, false)
    syncVideo(asVideoElement(video), clip, 15, true)
    expect(video.play).not.toHaveBeenCalled()
  })

  it('swallows a rejected play', async () => {
    const video = fakeVideo(5)
    video.play.mockRejectedValueOnce(new Error('NotAllowedError'))
    expect(() => syncVideo(asVideoElement(video), clip, 15, true)).not.toThrow()
    await Promise.resolve()
  })

  it('plays at normal rate when in step', () => {
    const video = fakeVideo(5, false)
    video.playbackRate = 1.05
    syncVideo(asVideoElement(video), clip, 15, true)
    expect(video.playbackRate).toBe(1)
    expect(video.currentTime).toBe(5)
  })

  it('slows down when ahead and speeds up when behind', () => {
    const ahead = fakeVideo(5.02, false)
    syncVideo(asVideoElement(ahead), clip, 15, true)
    expect(ahead.playbackRate).toBeCloseTo(0.96)

    const behind = fakeVideo(4.98, false)
    syncVideo(asVideoElement(behind), clip, 15, true)
    expect(behind.playbackRate).toBeCloseTo(1.04)
  })

  it('caps the rate nudge at ±10%', () => {
    const ahead = fakeVideo(5.2, false)
    syncVideo(asVideoElement(ahead), clip, 15, true)
    expect(ahead.playbackRate).toBe(0.9)

    const behind = fakeVideo(4.8, false)
    syncVideo(asVideoElement(behind), clip, 15, true)
    expect(behind.playbackRate).toBe(1.1)
  })

  it('seeks on a big jump instead of nudging', () => {
    const video = fakeVideo(1, false)
    syncVideo(asVideoElement(video), clip, 15, true)
    expect(video.currentTime).toBe(5)
    expect(video.playbackRate).toBe(1)
  })
})
