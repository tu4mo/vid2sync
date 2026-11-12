/** Pixels per second at each zoom level: round numbers, each about 1.25× the last. */
const PIXELS_PER_SECOND = [
  5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300,
  400, 500, 600, 800, 1000, 1200, 1500, 2000,
]

/** The highest zoom level; the lowest is 0. */
export const MAX_ZOOM = PIXELS_PER_SECOND.length - 1

/** The zoom level `steps` levels from `zoom`, stopping at the first and last. */
export function stepZoom(zoom: number, steps: number) {
  return Math.min(MAX_ZOOM, Math.max(0, zoom + steps))
}

export function zoomToPixelsPerSecond(zoom: number) {
  return PIXELS_PER_SECOND[zoom]
}
