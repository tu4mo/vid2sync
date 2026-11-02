import { NO_FADE, type Clip } from './clip'

/** A clip for tests: a 10 s file at 0:00, untrimmed, with no fades and no audio. */
export function testClip(overrides: Partial<Clip> = {}): Clip {
  const duration = overrides.duration ?? 10
  return {
    file: new File([], 'clip'),
    url: 'blob:clip',
    duration,
    offset: 0,
    trim: { start: 0, end: duration },
    fade: NO_FADE,
    buffer: null,
    peaks: null,
    ...overrides,
  }
}
