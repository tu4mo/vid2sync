export const MIN_PIXELS_PER_SECOND = 5
export const MAX_PIXELS_PER_SECOND = 2000

export function clampZoom(pixelsPerSecond: number) {
  return Math.min(
    MAX_PIXELS_PER_SECOND,
    Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond),
  )
}
