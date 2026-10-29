import { describe, expect, it } from 'vitest'

import { formatTime, parseTime, snapTo } from './time'

describe('formatTime', () => {
  it('formats minutes, seconds and milliseconds', () => {
    expect(formatTime(0)).toBe('0:00.000')
    expect(formatTime(62.5)).toBe('1:02.500')
    expect(formatTime(3600)).toBe('60:00.000')
  })

  it('keeps the sign of negative times', () => {
    expect(formatTime(-1.25)).toBe('-0:01.250')
  })
})

describe('parseTime', () => {
  it('reads seconds, minutes and hours', () => {
    expect(parseTime('62.5')).toBe(62.5)
    expect(parseTime('1:02.5')).toBe(62.5)
    expect(parseTime('0:01:02.5')).toBe(62.5)
  })

  it('accepts surrounding space and loose decimals', () => {
    expect(parseTime(' 5 ')).toBe(5)
    expect(parseTime('5.')).toBe(5)
    expect(parseTime('.5')).toBe(0.5)
  })

  it('rejects anything that is not a time', () => {
    expect(parseTime('')).toBeNull()
    expect(parseTime('abc')).toBeNull()
    expect(parseTime('1:-2')).toBeNull()
    expect(parseTime('1::2')).toBeNull()
  })
})

describe('snapTo', () => {
  it('snaps to the nearest target within the tolerance', () => {
    expect(snapTo(1.04, [1, 1.05, 2], 0.1)).toBe(1.05)
    expect(snapTo(1.5, [1, 2], 0.1)).toBe(1.5)
  })
})
