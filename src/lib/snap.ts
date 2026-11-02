/** Moves `t` onto the nearest of `targets` within `tolerance`, or leaves it as is. */
export function snapTo(
  t: number,
  targets: number[],
  tolerance: number,
): number {
  let best = t
  let distance = tolerance
  for (const target of targets) {
    if (Math.abs(target - t) <= distance) {
      best = target
      distance = Math.abs(target - t)
    }
  }
  return best
}
