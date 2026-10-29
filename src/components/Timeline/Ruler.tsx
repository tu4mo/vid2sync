import { useRef, useState } from 'react'

import { formatTime, type TimeRange } from '../../media'

const TICK_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
const SNAP_PX = 6

// Full class names, so Tailwind finds them in the source.
const HANDLE_CLASSES: Record<keyof TimeRange, string> = {
  start: 'rounded-r-md',
  end: '-translate-x-full rounded-l-md',
}

interface Props {
  pixelsPerSecond: number
  /** How many seconds of timeline to label. */
  seconds: number
  /** The export range, or null when there's nothing to export. */
  range: TimeRange | null
  /** Times the range handles snap to, such as the playhead and clip edges. */
  snapTimes: number[]
  onRangeChange: (which: keyof TimeRange, t: number) => void
  /** Puts one end, or with no argument the whole range, back to the video's edges. */
  onRangeReset: (which?: keyof TimeRange) => void
}

export function Ruler({
  pixelsPerSecond,
  seconds,
  range,
  snapTimes,
  onRangeChange,
  onRangeReset,
}: Props) {
  const [dragging, setDragging] = useState<keyof TimeRange | null>(null)
  // Where on the handle it was grabbed, so it doesn't jump under the pointer.
  const grabOffset = useRef(0)
  const step =
    TICK_STEPS.find((s) => s * pixelsPerSecond >= 80) ?? TICK_STEPS[TICK_STEPS.length - 1]
  const ticks: number[] = []
  for (let t = 0; t <= seconds; t += step) ticks.push(t)

  const snap = (t: number) => {
    let best = t
    let distance = SNAP_PX / pixelsPerSecond
    for (const target of snapTimes) {
      if (Math.abs(target - t) <= distance) {
        best = target
        distance = Math.abs(target - t)
      }
    }
    return best
  }

  return (
    <div className="relative h-7 border-b border-line bg-panel-2">
      {range && (
        <div
          className="absolute inset-y-0 bg-accent/15"
          style={{
            left: range.start * pixelsPerSecond,
            width: (range.end - range.start) * pixelsPerSecond,
          }}
          title="Export range (double-click to reset)"
          // Not onDoubleClick: the timeline captures the pointer to scrub, which sends clicks to it instead.
          onMouseDown={(e) => e.detail === 2 && onRangeReset()}
        />
      )}

      {ticks.map((t) => (
        <div
          key={t}
          className="pointer-events-none absolute top-3.5 bottom-0 border-l border-line-strong"
          style={{ left: t * pixelsPerSecond }}
        >
          <span className="absolute -top-[13px] left-1 text-2xs whitespace-nowrap text-dim tabular-nums">
            {formatTick(t, step)}
          </span>
        </div>
      ))}

      {range &&
        (['start', 'end'] as const).flatMap((which) => [
          // Drawn under the playhead's time, but grabbed above it (the transparent twin below).
          <div
            key={`${which}-look`}
            className={`pointer-events-none absolute top-0 z-1 h-7 w-2.5 bg-accent ${HANDLE_CLASSES[which]}`}
            style={{ left: range[which] * pixelsPerSecond }}
          />,
          <div
            key={which}
            className={`absolute top-0 z-4 h-7 w-2.5 cursor-ew-resize touch-none ${HANDLE_CLASSES[which]}`}
            style={{ left: range[which] * pixelsPerSecond }}
            title={`Export ${which} (drag, Shift to not snap; double-click to reset)`}
            data-testid={`range-${which}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              // Keep the timeline from scrubbing under the handle.
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              grabOffset.current = e.clientX - range[which] * pixelsPerSecond
              setDragging(which)
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
              const t = (e.clientX - grabOffset.current) / pixelsPerSecond
              onRangeChange(which, e.shiftKey ? t : snap(t))
            }}
            onLostPointerCapture={() => setDragging(null)}
            onDoubleClick={() => onRangeReset(which)}
          />,
        ])}

      {range && dragging && (
        <div
          className={`pointer-events-none absolute top-full z-2 mt-1 rounded-md border border-line-strong bg-panel-2 px-1.5 py-0.5 text-2xs whitespace-nowrap tabular-nums ${
            dragging === 'end' ? '-translate-x-full' : ''
          }`}
          style={{ left: range[dragging] * pixelsPerSecond }}
        >
          {formatTime(range[dragging])}{' '}
          <span className="text-dim">({(range.end - range.start).toFixed(2)} s)</span>
        </div>
      )}
    </div>
  )
}

function formatTick(t: number, step: number): string {
  if (step >= 1) {
    const m = Math.floor(t / 60)
    const s = Math.round(t - m * 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  return `${t.toFixed(step < 0.1 ? 2 : 1)}s`
}
