import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { testClip } from '../test/testClip'
import { NO_FADE, type Clip, type Clips } from './clip'
import { Playback, scheduleClips } from './playback'

class FakeAudioContext {
  currentTime = 10
  destination = {}
  gains: {
    connect: ReturnType<typeof vi.fn>
    gain: {
      setTargetAtTime: ReturnType<typeof vi.fn>
      setValueCurveAtTime: ReturnType<typeof vi.fn>
      setValueAtTime: ReturnType<typeof vi.fn>
    }
  }[] = []
  sources: {
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }[] = []
  resume = vi.fn(async () => {})

  createGain() {
    const gain = {
      connect: vi.fn(),
      gain: {
        setTargetAtTime: vi.fn(),
        setValueCurveAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
    }
    this.gains.push(gain)
    return gain
  }

  createBufferSource() {
    const source = {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    this.sources.push(source)
    return source
  }
}

function clip(
  duration: number,
  offset = 0,
  trim = { start: 0, end: duration },
  fade = NO_FADE,
): Clip {
  return testClip({
    duration,
    offset,
    trim,
    fade,
    buffer: { duration } as AudioBuffer,
  })
}

const clips: Clips = { video: clip(60), audio: clip(60) }

function asAudioContext(audioContext: FakeAudioContext) {
  return audioContext as unknown as BaseAudioContext
}

function output(kind: string) {
  return { kind } as unknown as AudioNode
}

describe('Playback', () => {
  let playback: Playback
  let audioContext: FakeAudioContext

  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    playback = new Playback()
    audioContext = playback.audioContext as unknown as FakeAudioContext
  })

  afterEach(() => vi.unstubAllGlobals())

  it('holds its position while paused', () => {
    playback.seek(5)
    audioContext.currentTime = 20
    expect(playback.playing).toBe(false)
    expect(playback.now()).toBe(5)
    expect(playback.startedFrom()).toBe(5)
  })

  it('follows the audio clock after a short lead', () => {
    playback.setClips(clips)
    playback.play(5)
    expect(audioContext.resume).toHaveBeenCalled()
    expect(audioContext.sources).toHaveLength(2)
    for (const source of audioContext.sources) {
      expect(source.start).toHaveBeenCalledWith(10.05, 5, 55)
    }

    // Inside the lead, time hasn't started moving yet.
    expect(playback.now()).toBe(5)
    audioContext.currentTime = 12.05
    expect(playback.now()).toBeCloseTo(7)
  })

  it('stops the audio and keeps the position on pause', () => {
    playback.setClips(clips)
    playback.play(0)
    audioContext.currentTime = 13.05
    playback.pause()

    expect(playback.playing).toBe(false)
    expect(playback.now()).toBeCloseTo(3)
    for (const source of audioContext.sources) {
      expect(source.stop).toHaveBeenCalled()
    }
  })

  it('re-schedules from the new time when seeking during playback', () => {
    playback.setClips(clips)
    playback.play(0)
    playback.seek(30)

    expect(playback.startedFrom()).toBe(30)
    expect(audioContext.sources).toHaveLength(4)
    expect(audioContext.sources[0].stop).toHaveBeenCalled()
    expect(audioContext.sources[2].start).toHaveBeenCalledWith(10.05, 30, 30)
  })

  it('re-schedules from the current time when clips change during playback', () => {
    playback.play(0)
    expect(audioContext.sources).toHaveLength(0)

    audioContext.currentTime = 12.05
    playback.setClips(clips)
    expect(audioContext.sources).toHaveLength(2)
    expect(playback.startedFrom()).toBeCloseTo(2)
  })

  it('stops the audio and parks the position on stopAt', () => {
    playback.setClips(clips)
    playback.play(0)
    playback.stopAt(42)

    expect(playback.playing).toBe(false)
    expect(playback.now()).toBe(42)
    for (const source of audioContext.sources) {
      expect(source.stop).toHaveBeenCalled()
    }
  })

  it('routes each track through its own gain', () => {
    const [video, audio] = audioContext.gains
    for (const gain of audioContext.gains) {
      expect(gain.connect).toHaveBeenCalledWith(audioContext.destination)
    }

    playback.setGain('audio', 0.5)
    expect(audio.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 10, 0.01)
    expect(video.gain.setTargetAtTime).not.toHaveBeenCalled()
  })
})

describe('scheduleClips', () => {
  it('delays clips that start after the playhead', () => {
    const audioContext = new FakeAudioContext()
    const tracks: Clips = { video: clip(10, 3), audio: null }
    scheduleClips(asAudioContext(audioContext), tracks, 1, 100, output)
    expect(audioContext.sources[0].start).toHaveBeenCalledWith(102, 0, 10)
    expect(audioContext.sources[0].connect).toHaveBeenCalledWith({
      kind: 'video',
    })
  })

  it('starts partway into clips the playhead is inside', () => {
    const audioContext = new FakeAudioContext()
    const tracks: Clips = { video: null, audio: clip(10, 1) }
    scheduleClips(asAudioContext(audioContext), tracks, 4, 100, output)
    expect(audioContext.sources[0].start).toHaveBeenCalledWith(100, 3, 7)
  })

  it('plays only the trimmed part of a clip', () => {
    const audioContext = new FakeAudioContext()
    // The file sits at 1 s and is used from 2 s to 5 s into it: 3–6 s on the timeline.
    const trimmed = clip(10, 1, { start: 2, end: 5 })
    scheduleClips(
      asAudioContext(audioContext),
      { video: trimmed, audio: null },
      0,
      100,
      output,
    )
    expect(audioContext.sources[0].start).toHaveBeenCalledWith(103, 2, 3)

    scheduleClips(
      asAudioContext(audioContext),
      { video: trimmed, audio: null },
      4,
      100,
      output,
    )
    expect(audioContext.sources[1].start).toHaveBeenCalledWith(100, 3, 2)

    expect(
      scheduleClips(
        asAudioContext(audioContext),
        { video: trimmed, audio: null },
        6,
        100,
        output,
      ),
    ).toEqual([])
  })

  it('skips clips that ended, have no audio, or have no output', () => {
    const audioContext = new FakeAudioContext()
    const ended: Clips = {
      video: clip(2, 0),
      audio: { ...clip(10, 0), buffer: null },
    }
    expect(
      scheduleClips(asAudioContext(audioContext), ended, 2, 0, output),
    ).toEqual([])

    const muted: Clips = { video: clip(10, 0), audio: clip(10, 0) }
    const scheduled = scheduleClips(
      asAudioContext(audioContext),
      muted,
      0,
      0,
      (kind) => (kind === 'audio' ? output(kind) : null),
    )
    expect(scheduled).toHaveLength(1)
    expect(audioContext.sources[0].connect).toHaveBeenCalledWith({
      kind: 'audio',
    })
  })

  it('fades a clip through a gain of its own', () => {
    const audioContext = new FakeAudioContext()
    const faded = clip(10, 2, undefined, {
      start: { silent: 0, full: 1 },
      end: { silent: 0, full: 0 },
    })
    scheduleClips(
      asAudioContext(audioContext),
      { video: faded, audio: null },
      0,
      100,
      output,
    )

    const [gain] = audioContext.gains
    expect(audioContext.sources[0].connect).toHaveBeenCalledWith(gain)
    expect(gain.connect).toHaveBeenCalledWith({ kind: 'video' })
    expect(gain.gain.setValueCurveAtTime).toHaveBeenCalledWith(
      expect.any(Float32Array),
      102,
      1,
    )
  })
})
