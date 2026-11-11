/** How close, in pixels, a dragged edge or fade has to come to a snap target to land on it. */
export const SNAP_PX = 6

/** Moves `time` onto the nearest of `targets` within `tolerance`, or leaves it as is. */
export function snapTo(
  time: number,
  targets: number[],
  tolerance: number,
): number {
  const inReach = targets.filter(
    (target) => Math.abs(target - time) <= tolerance,
  )
  // The last of equally near targets wins.
  return inReach.reduce(
    (best, target) =>
      Math.abs(target - time) <= Math.abs(best - time) ? target : best,
    inReach[0] ?? time,
  )
}
