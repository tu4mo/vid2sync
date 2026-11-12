import { describe, expect, it } from 'vitest'

import { MAX_ZOOM, stepZoom, zoomToPixelsPerSecond } from './zoom'

describe('stepZoom', () => {
  it('steps by whole levels', () => {
    expect(stepZoom(4, 1)).toBe(5)
    expect(stepZoom(4, -3)).toBe(1)
  })

  it('stops at the first and last level', () => {
    expect(stepZoom(1, -3)).toBe(0)
    expect(stepZoom(MAX_ZOOM - 1, 3)).toBe(MAX_ZOOM)
  })
})

describe('zoomToPixelsPerSecond', () => {
  it('runs from 5 to 2000 pixels per second', () => {
    expect(zoomToPixelsPerSecond(0)).toBe(5)
    expect(zoomToPixelsPerSecond(MAX_ZOOM)).toBe(2000)
  })

  it('zooms in by about 1.25× a level', () => {
    for (let zoom = 1; zoom <= MAX_ZOOM; zoom++) {
      const factor =
        zoomToPixelsPerSecond(zoom) / zoomToPixelsPerSecond(zoom - 1)
      expect(factor).toBeGreaterThanOrEqual(1.15)
      expect(factor).toBeLessThanOrEqual(1.35)
    }
  })
})
