import { describe, expect, it } from 'vitest'

import { snapTo } from './time'

describe('snapTo', () => {
  it('snaps to the nearest target within the tolerance', () => {
    expect(snapTo(1.04, [1, 1.05, 2], 0.1)).toBe(1.05)
    expect(snapTo(1.5, [1, 2], 0.1)).toBe(1.5)
  })
})
