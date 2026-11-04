import { describe, expect, it } from 'vitest'

import { errorMessage } from './error'

describe('errorMessage', () => {
  it('uses an Error’s message', () => {
    expect(errorMessage(new Error('Could not read “a.mov”'))).toBe(
      'Could not read “a.mov”',
    )
    expect(errorMessage(new TypeError('bad type'))).toBe('bad type')
  })

  it('turns anything else thrown into a string', () => {
    expect(errorMessage('plain text')).toBe('plain text')
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
  })
})
