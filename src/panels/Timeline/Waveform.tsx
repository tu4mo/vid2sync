import type { Peaks } from '../../lib/clip'

type Props = {
  peaks: Peaks
  color: string
}

/**
 * The outline of the peaks, from the highest samples along the top and back along the lowest.
 * In bucket units across and samples (-1 to 1) down, for the SVG's viewBox to scale.
 */
function outline({ min, max }: Peaks) {
  const points: string[] = []
  for (let bucket = 0; bucket < max.length; bucket++) {
    points.push(`${bucket},${(-max[bucket]).toFixed(3)}`)
  }
  for (let bucket = min.length - 1; bucket >= 0; bucket--) {
    points.push(`${bucket},${(-min[bucket]).toFixed(3)}`)
  }
  return `M${points.join('L')}Z`
}

/**
 * The waveform as a vector, stretched to fill its box. The browser draws it at whatever size the
 * zoom makes it, and only the tiles that scroll into view, so it's sharp at any zoom.
 */
export function Waveform({ peaks, color }: Props) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 block size-full"
      viewBox={`0 -1 ${Math.max(1, peaks.max.length)} 2`}
      preserveAspectRatio="none"
      data-testid="waveform"
    >
      <path d={outline(peaks)} fill={color} />
    </svg>
  )
}
