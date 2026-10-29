import { memo } from 'react'

const TICK_STEPS = [
  0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
]

type Props = {
  pixelsPerSecond: number
  /** How many seconds of timeline to label. */
  seconds: number
}

// Memoized, so it doesn't rebuild every tick on each playback frame.
export const Ruler = memo(function Ruler({ pixelsPerSecond, seconds }: Props) {
  const step =
    TICK_STEPS.find((s) => s * pixelsPerSecond >= 80) ??
    TICK_STEPS[TICK_STEPS.length - 1]
  const ticks: number[] = []
  for (let t = 0; t <= seconds; t += step) {
    ticks.push(t)
  }

  return (
    <div className="relative border-b border-line bg-panel-2">
      {/* Clipped, so the labels of the last ticks don't widen the scroll area past the lanes. */}
      <div className="pointer-events-none absolute inset-0 overflow-clip">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-3.5 bottom-0 border-l border-line-strong"
            style={{ left: t * pixelsPerSecond }}
          >
            <span className="absolute -top-[13px] left-1 text-2xs whitespace-nowrap text-dim tabular-nums">
              {formatTick(t, step)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})

function formatTick(t: number, step: number): string {
  if (step >= 1) {
    const m = Math.floor(t / 60)
    const s = Math.round(t - m * 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  return `${t.toFixed(step < 0.1 ? 2 : 1)}s`
}
