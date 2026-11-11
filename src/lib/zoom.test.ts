import { describe, expect, it } from 'vitest'

import { MAX_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND, clampZoom } from './zoom'

describe('clampZoom', () => {
  it('keeps a zoom inside the range as it is', () => {
    expect(clampZoom(100)).toBe(100)
  })

  it('clamps a zoom outside the range to its nearest limit', () => {
    expect(clampZoom(1)).toBe(MIN_PIXELS_PER_SECOND)
    expect(clampZoom(-50)).toBe(MIN_PIXELS_PER_SECOND)
    expect(clampZoom(10_000)).toBe(MAX_PIXELS_PER_SECOND)
  })
})
