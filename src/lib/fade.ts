import type { Fade, TimeRange } from './clip'

/** The gain at `progress` (0 to 1) through a linear fade-in. A fade-out runs it backwards. */
export function fadeGain(progress: number): number {
  return Math.min(1, Math.max(0, progress))
}

const CURVE_POINTS = 64

/** Samples the gain from fade progress `from` to `to`, as a value curve for an AudioParam. */
export function fadeCurve(from: number, to: number): Float32Array {
  return Float32Array.from({ length: CURVE_POINTS }, (_, i) =>
    fadeGain(from + ((to - from) * i) / (CURVE_POINTS - 1)),
  )
}

/**
 * Automates `param` with a clip's fades over its `span` on the timeline, as heard from timeline
 * time `from`, which sounds at context time `at`. Starting inside a fade picks it up partway.
 */
export function scheduleFade(
  param: AudioParam,
  span: TimeRange,
  fade: Fade,
  from: number,
  at: number,
) {
  function contextTime(time: number) {
    return at + time - from
  }

  /**
   * The fade-in: silent, then ramping up from `rampStart` to `rampEnd`. Returns the context time
   * its curve ends, or -Infinity when there's none.
   */
  function scheduleFadeIn() {
    if (fade.start.full <= 0) {
      return -Infinity
    }
    const rampStart = span.start + fade.start.silent
    const rampEnd = span.start + fade.start.full
    if (from < rampStart) {
      param.setValueAtTime(0, at)
    }
    if (rampEnd <= from) {
      return -Infinity
    }
    const rampFrom = Math.max(rampStart, from)
    const startAt = contextTime(rampFrom)
    const duration = contextTime(rampEnd) - startAt
    param.setValueCurveAtTime(
      fadeCurve((rampFrom - rampStart) / (rampEnd - rampStart), 1),
      startAt,
      duration,
    )
    return startAt + duration
  }
  const inEndAt = scheduleFadeIn()

  // The fade-out: ramping down from `rampStart` to `rampEnd`, then silent.
  if (fade.end.full > 0) {
    const rampStart = span.end - fade.end.full
    const rampEnd = span.end - fade.end.silent
    if (rampEnd > from) {
      const rampFrom = Math.max(rampStart, from)
      // Curves can't overlap, so rounding mustn't start this one before the fade-in ends.
      const startAt = Math.max(contextTime(rampFrom), inEndAt)
      param.setValueCurveAtTime(
        fadeCurve(1 - (rampFrom - rampStart) / (rampEnd - rampStart), 0),
        startAt,
        contextTime(rampEnd) - startAt,
      )
    } else if (span.end > from) {
      param.setValueAtTime(0, at)
    }
  }
}
