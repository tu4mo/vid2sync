/** How close, in pixels, a dragged edge or fade has to come to a snap target to land on it. */
export const SNAP_PX = 6

/** Moves `time` onto the nearest of `targets` within `tolerance`, or leaves it as is. */
export function snapTo(
  time: number,
  targets: number[],
  tolerance: number,
): number {
  let best = time
  let distance = tolerance
  for (const target of targets) {
    if (Math.abs(target - time) <= distance) {
      best = target
      distance = Math.abs(target - time)
    }
  }
  return best
}
