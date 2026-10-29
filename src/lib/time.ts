/** Formats seconds as `m:ss.mmm`, e.g. `62.5` as `1:02.500`. */
export function formatTime(t: number): string {
  const sign = t < 0 ? '-' : ''
  const abs = Math.abs(t)
  const m = Math.floor(abs / 60)
  const s = abs - m * 60
  return `${sign}${m}:${s.toFixed(3).padStart(6, '0')}`
}

/** Reads a typed time such as `1:02.5`, `62.5` or `0:01:02.5`; null if it isn't one. */
export function parseTime(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.some((p) => !/^\d*\.?\d+$|^\d+\.$/.test(p.trim()))) return null
  return parts.reduce((t, p) => t * 60 + Number(p), 0)
}

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
