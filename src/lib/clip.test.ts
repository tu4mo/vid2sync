import { describe, expect, it } from 'vitest'

import {
  clipFade,
  clipSpan,
  clipsEnd,
  fadeClip,
  fitFade,
  moveClip,
  untrimClip,
  syncTo,
  trimClip,
  updateClip,
  type Clip,
  type Fade,
} from './clip'
import { testClip } from './testClip'

describe('clipSpan', () => {
  it('places the trimmed part on the timeline', () => {
    const clip = { offset: -1, trim: { start: 2, end: 5 } } as Clip
    expect(clipSpan(clip)).toEqual({ start: 1, end: 4 })
  })
})

// A 3 s trimmed part with the given fades.
function faded(fade: Fade) {
  return { trim: { start: 1, end: 4 }, fade } as Clip
}

describe('fitFade', () => {
  it('keeps a fade that fits', () => {
    expect(fitFade({ silent: 0.5, full: 1 }, 3)).toEqual({
      silent: 0.5,
      full: 1,
    })
  })

  it('cuts it down to the room, with the silence inside it', () => {
    expect(fitFade({ silent: 2, full: 4 }, 3)).toEqual({ silent: 2, full: 3 })
    expect(fitFade({ silent: 1, full: -1 }, 3)).toEqual({ silent: 0, full: 0 })
  })

  it('keeps a short ramp after the silence', () => {
    expect(fitFade({ silent: 2, full: 1 }, 3)).toEqual({
      silent: 0.99,
      full: 1,
    })
  })
})

describe('clipFade', () => {
  it('keeps fades that fit the trimmed part', () => {
    const fade = {
      start: { silent: 0, full: 1 },
      end: { silent: 0.5, full: 1.5 },
    }
    expect(clipFade(faded(fade))).toEqual(fade)
  })

  it('cuts fades down to fit, the fade-in first', () => {
    expect(
      clipFade(
        faded({ start: { silent: 0, full: 2 }, end: { silent: 0, full: 2 } }),
      ),
    ).toEqual({ start: { silent: 0, full: 2 }, end: { silent: 0, full: 1 } })
  })
})

describe('clipsEnd', () => {
  it('is where the last clip ends', () => {
    const video = testClip({ offset: 1, trim: { start: 0, end: 4 } })
    const audio = testClip({ offset: 2, trim: { start: 1, end: 2 } })
    expect(clipsEnd({ video, audio })).toBe(5)
  })

  it('is 0 with no clips', () => {
    expect(clipsEnd({ video: null, audio: null })).toBe(0)
  })
})

describe('updateClip', () => {
  it('edits the clip on the track', () => {
    const clips = { video: testClip(), audio: null }
    expect(
      updateClip(clips, 'video', (c) => moveClip(c, 2)).video?.offset,
    ).toBe(2)
  })

  it('leaves an empty track alone', () => {
    const clips = { video: null, audio: null }
    expect(updateClip(clips, 'audio', (c) => moveClip(c, 2))).toBe(clips)
  })
})

describe('moveClip', () => {
  it('moves the clip, rounded to the millisecond', () => {
    expect(moveClip(testClip(), 1.23456).offset).toBe(1.235)
  })

  it('keeps the trimmed part from starting before 0:00', () => {
    const clip = testClip({ trim: { start: 2, end: 8 } })
    expect(moveClip(clip, -5).offset).toBe(-2)
  })
})

describe('trimClip', () => {
  // The file starts at 1 s on the timeline.
  const clip = testClip({ offset: 1 })

  it('moves the start or end to a timeline time', () => {
    expect(trimClip(clip, 'start', 3).trim).toEqual({ start: 2, end: 10 })
    expect(trimClip(clip, 'end', 6).trim).toEqual({ start: 0, end: 5 })
  })

  it('stays within the file', () => {
    expect(trimClip(clip, 'start', 0).trim.start).toBe(0)
    expect(trimClip(clip, 'end', 20).trim.end).toBe(10)
  })

  it("doesn't start before 0:00", () => {
    const early = testClip({ offset: -3, trim: { start: 4, end: 10 } })
    expect(trimClip(early, 'start', -1).trim.start).toBe(3)
  })

  it('leaves the shortest clip between the edges', () => {
    expect(trimClip(clip, 'start', 20).trim.start).toBe(9.95)
    expect(trimClip(clip, 'end', 0).trim.end).toBe(0.05)
  })
})

describe('untrimClip', () => {
  const clip = testClip({ offset: 1, trim: { start: 2, end: 5 } })

  it('puts one edge back at the file edge', () => {
    expect(untrimClip(clip, 'start').trim).toEqual({ start: 0, end: 5 })
    expect(untrimClip(clip, 'end').trim).toEqual({ start: 2, end: 10 })
  })

  it('puts both back with no edge', () => {
    expect(untrimClip(clip).trim).toEqual({ start: 0, end: 10 })
  })

  it('only goes back as far as 0:00', () => {
    const early = testClip({ offset: -3, trim: { start: 4, end: 10 } })
    expect(untrimClip(early, 'start').trim.start).toBe(3)
  })
})

describe('fadeClip', () => {
  const clip = testClip({ trim: { start: 0, end: 4 } })

  it('sets a fade, rounded to the millisecond', () => {
    expect(
      fadeClip(clip, 'start', { silent: 0, full: 1.00049 }).fade.start,
    ).toEqual({
      silent: 0,
      full: 1,
    })
  })

  it('leaves room for the other fade', () => {
    const fadedIn = fadeClip(clip, 'start', { silent: 0, full: 3 })
    expect(fadeClip(fadedIn, 'end', { silent: 0, full: 2 }).fade.end).toEqual({
      silent: 0,
      full: 1,
    })
  })
})

describe('syncTo', () => {
  const video = testClip({ offset: 1 })

  it('moves the audio to start the gap after the video', () => {
    expect(syncTo(video, testClip(), 500)).toEqual({ delta: 500, audio: 1.5 })
  })

  it('moves the video instead when the audio would start before 0:00', () => {
    // Trimmed to start 1 s into the file, so it can go down to -1.
    const audio = testClip({ trim: { start: 1, end: 10 } })
    expect(syncTo(video, audio, -3000)).toEqual({
      delta: -3000,
      audio: -1,
      video: 2,
    })
  })

  it('keeps the clips overlapping', () => {
    expect(syncTo(video, testClip({ duration: 3 }), 60_000).delta).toBe(10_000)
    expect(syncTo(video, testClip({ duration: 3 }), -60_000).delta).toBe(-3000)
  })
})
