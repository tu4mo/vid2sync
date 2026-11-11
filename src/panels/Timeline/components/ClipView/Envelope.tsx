import { clsx } from 'clsx'

import { MAX_VOLUME, hasFade, type Fade } from '../../../../lib/clip'
import { fadeGain } from '../../../../lib/fade'
import { STICKY_UNDER_PLAY_LEFT_PX } from '../../../../lib/layout'
import { useDrag } from '../../hooks/useDrag'
import { ENVELOPE_INSET_PX, levelTop, volumeLevel } from '../../lib/level'

/** The readout's gap from the line's start. */
const LABEL_INSET_PX = 4
// Shown while the line is hovered or dragged.
const REVEAL =
  'opacity-0 transition-opacity group-hover/volume:opacity-100 group-active/volume:opacity-100'

const CURVE_POINTS = 32

type Point = [x: number, y: number]

function path(points: Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' L')
}

/**
 * A fade's ramp from `from` to `to` (in pixels across the clip), rising for a fade-in and
 * falling for a fade-out, up to `level` (0 to 1, of the clip's height).
 */
function ramp(from: number, to: number, rising: boolean, level: number) {
  return Array.from({ length: CURVE_POINTS + 1 }, (_, i): Point => {
    const progress = i / CURVE_POINTS
    return [
      from + progress * (to - from),
      1 - level * fadeGain(rising ? progress : 1 - progress),
    ]
  })
}

type Props = {
  fade: Fade
  volume: number
  width: number
  pixelsPerSecond: number
  onGrab: () => void
  onChange: (volume: number) => void
}

/**
 * The clip's volume over time: silent, ramping up through the fade-in to the volume line,
 * and back down through the fade-out, with everything above it shaded. The line between the
 * fades drags up and down to set the volume; above 100% it stays at the top.
 */
export function Envelope({
  fade,
  volume,
  width,
  pixelsPerSecond,
  onGrab,
  onChange,
}: Props) {
  const drag = useDrag(
    (e) => {
      onGrab()
      // The line travels the clip's height, less the envelope's insets.
      const clip = e.currentTarget.parentElement!
      const height = clip.clientHeight - 2 * ENVELOPE_INSET_PX
      return { lastY: e.clientY, volume, height, sent: volume }
    },
    (e, dragState) => {
      // Shift slows the drag down 10× for fine adjustment.
      const deltaY = (dragState.lastY - e.clientY) * (e.shiftKey ? 0.1 : 1)
      dragState.lastY = e.clientY
      dragState.volume = Math.min(
        Math.max(dragState.volume + deltaY / dragState.height, 0),
        MAX_VOLUME,
      )
      const rounded = Math.round(dragState.volume * 100) / 100
      // Most moves don't change the rounded volume, so they needn't re-render.
      if (rounded !== dragState.sent) {
        dragState.sent = rounded
        onChange(rounded)
      }
    },
  )
  const level = volumeLevel(volume)
  const percent = Math.round(volume * 100)
  // Where the line between the fades starts and ends, in pixels across the clip.
  const lineFrom = fade.start.full * pixelsPerSecond
  const lineTo = width - fade.end.full * pixelsPerSecond
  const hasIn = hasFade(fade.start)
  const hasOut = hasFade(fade.end)
  const rampIn: Point[] = hasIn
    ? ramp(fade.start.silent * pixelsPerSecond, lineFrom, true, level)
    : [[0, 1 - level]]
  const rampOut: Point[] = hasOut
    ? ramp(lineTo, width - fade.end.silent * pixelsPerSecond, false, level)
    : [[width, 1 - level]]
  // The line runs along the ramps, and between them only below full volume, where it's off the clip's top edge.
  const line =
    level < 1
      ? `M${path([...rampIn, ...rampOut])}`
      : [hasIn && `M${path(rampIn)}`, hasOut && `M${path(rampOut)}`]
          .filter(Boolean)
          .join(' ')

  return (
    <>
      <svg
        // Rounded like the clip's corners, since the clip no longer clips it.
        className="pointer-events-none absolute inset-0 z-10 size-full rounded-md"
        viewBox={`0 0 ${Math.max(width, 1)} 1`}
        preserveAspectRatio="none"
      >
        <path
          d={`M0,0 L0,1 L${path([...rampIn, ...rampOut])} L${width},1 L${width},0 Z`}
          className="fill-black/35"
        />
        {line && (
          <path
            d={line}
            className="fill-none stroke-white/80"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {lineTo > lineFrom && (
        <div
          // Over the envelope (z-10), under the trim handles (z-20), which keep the clip's edges,
          // and the fade dots (z-30).
          className="group/volume absolute z-15 h-2 -translate-y-1/2 cursor-ns-resize"
          style={{
            left: lineFrom,
            width: lineTo - lineFrom,
            top: levelTop(level),
          }}
          title={`Volume ${percent}% (drag, Shift for fine; double-click to reset)`}
          data-testid="volume"
          data-volume={volume}
          {...drag}
          onDoubleClick={() => onChange(1)}
        >
          <div
            className={clsx(
              'absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-white',
              REVEAL,
            )}
          />
          {/* Below the line in the clip's top half, above it in the bottom half, so it stays inside the clip. */}
          <div
            className={clsx(
              'pointer-events-none absolute inset-x-0',
              REVEAL,
              level > 0.5 ? 'top-full mt-0.5' : 'bottom-full mb-0.5',
            )}
          >
            {/* As wide as the readout, not the line: a sticky box as wide as its parent has no room to move. */}
            <div
              className="sticky w-max"
              style={{ left: STICKY_UNDER_PLAY_LEFT_PX - LABEL_INSET_PX }}
            >
              <span
                className="block rounded bg-panel-2 px-1 text-xs tabular-nums"
                style={{ marginLeft: LABEL_INSET_PX }}
              >
                {percent}%
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
