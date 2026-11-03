/** How far the envelope's top and bottom sit in from the clip's, centering the dots on its 2px border. */
export const ENVELOPE_INSET_PX = 1
/** How high the volume line sits, from 0 (silent, at the bottom) to 1 (full, at the top). Boost pins it to the top. */
export function volumeLevel(volume: number): number {
  return Math.min(volume, 1)
}

/** The CSS `top` of the volume line, the dots that ride it, and anything centered on it. */
export function levelTop(level: number): string {
  return `calc(${ENVELOPE_INSET_PX}px + ${1 - level} * (100% - ${2 * ENVELOPE_INSET_PX}px))`
}
