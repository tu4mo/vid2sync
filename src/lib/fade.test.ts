import { describe, expect, it, vi } from 'vitest'

import { fadeCurve, fadeGain, scheduleFade } from './fade'
import { NO_FADE } from './media'

// On the timeline from 2 s to 6 s, fading in over its first second and out over its last two.
const span = { start: 2, end: 6 }
const fade = { start: { silent: 0, full: 1 }, end: { silent: 0, full: 2 } }
// The same, but silent for its first and last half second.
const silenced = {
  start: { silent: 0.5, full: 1 },
  end: { silent: 0.5, full: 2 },
}

describe('fadeGain', () => {
  it('rises linearly', () => {
    expect(fadeGain(0)).toBe(0)
    expect(fadeGain(0.5)).toBe(0.5)
    expect(fadeGain(1)).toBe(1)
  })

  it('holds outside the fade', () => {
    expect(fadeGain(-1)).toBe(0)
    expect(fadeGain(2)).toBe(1)
  })
})

describe('fadeCurve', () => {
  it('samples the gain in either direction', () => {
    const up = fadeCurve(0, 1)
    expect(up[0]).toBe(0)
    expect(up[up.length - 1]).toBe(1)
    const down = fadeCurve(1, 0)
    expect(down[0]).toBe(1)
    expect(down[down.length - 1]).toBeCloseTo(0)
  })
})

function fakeParam() {
  const setValueCurveAtTime =
    vi.fn<(curve: Float32Array, startTime: number, duration: number) => void>()
  const setValueAtTime = vi.fn<(value: number, startTime: number) => void>()
  return {
    param: { setValueCurveAtTime, setValueAtTime } as unknown as AudioParam,
    /** Each curve as its first and last gain, start time and duration. */
    curves: () =>
      setValueCurveAtTime.mock.calls.map(([curve, startTime, duration]) => ({
        from: curve[0],
        to: curve[curve.length - 1],
        startTime,
        duration,
      })),
    /** Each fixed value as the value and when it's set. */
    values: () => setValueAtTime.mock.calls,
  }
}

describe('scheduleFade', () => {
  it('fades in and out when playing from before the clip', () => {
    const { param, curves } = fakeParam()
    scheduleFade(param, span, fade, 0, 100)
    expect(curves()).toEqual([
      { from: 0, to: 1, startTime: 102, duration: 1 },
      { from: 1, to: expect.closeTo(0), startTime: 104, duration: 2 },
    ])
  })

  it('picks up partway through the fade-in', () => {
    const { param, curves } = fakeParam()
    scheduleFade(param, span, fade, 2.5, 100)
    expect(curves()[0]).toEqual({
      from: 0.5,
      to: 1,
      startTime: 100,
      duration: 0.5,
    })
    expect(curves()[1].startTime).toBe(101.5)
  })

  it('picks up partway through the fade-out', () => {
    const { param, curves } = fakeParam()
    scheduleFade(param, span, fade, 5, 100)
    expect(curves()).toEqual([
      { from: 0.5, to: expect.closeTo(0), startTime: 100, duration: 1 },
    ])
  })

  it('stays silent before the fade-in and after the fade-out', () => {
    const { param, curves, values } = fakeParam()
    scheduleFade(param, span, silenced, 0, 100)
    expect(values()).toEqual([[0, 100]])
    expect(curves()).toEqual([
      { from: 0, to: 1, startTime: 102.5, duration: 0.5 },
      { from: 1, to: expect.closeTo(0), startTime: 104, duration: 1.5 },
    ])
  })

  it('starts silent when playing from inside a silence', () => {
    const before = fakeParam()
    scheduleFade(before.param, span, silenced, 2.25, 100)
    expect(before.values()).toEqual([[0, 100]])
    expect(before.curves()[0].startTime).toBe(100.25)

    const after = fakeParam()
    scheduleFade(after.param, span, silenced, 5.75, 100)
    expect(after.values()).toEqual([[0, 100]])
    expect(after.curves()).toEqual([])
  })

  it('leaves the gain alone with no fades, or past them', () => {
    const { param, curves, values } = fakeParam()
    scheduleFade(param, span, NO_FADE, 0, 100)
    scheduleFade(param, span, fade, 6, 100)
    expect(curves()).toEqual([])
    expect(values()).toEqual([])
  })

  it('starts the fade-out exactly where a fade-in meeting it ends', () => {
    const { param, curves } = fakeParam()
    // Times that don't add up exactly in floating point.
    scheduleFade(
      param,
      { start: 0.1, end: 0.7 },
      { start: { silent: 0, full: 0.2 }, end: { silent: 0, full: 0.4 } },
      0,
      0.3,
    )
    const [fadeIn, fadeOut] = curves()
    expect(fadeOut.startTime).toBeGreaterThanOrEqual(
      fadeIn.startTime + fadeIn.duration,
    )
  })
})
