import type { Peaks } from '../../../lib/clip'

type Props = {
  peaks: Peaks
  pixelsPerSecond: number
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
 * The waveform as a vector, from the start of the file. The browser draws it at whatever size the
 * zoom makes it, and only the tiles that scroll into view, so it's sharp at any zoom.
 */
export function Waveform({ peaks, pixelsPerSecond, color }: Props) {
  const buckets = Math.max(1, peaks.max.length)
  return (
    <svg
      className="pointer-events-none absolute inset-y-0 left-0 block h-full"
      // Sized by the peaks' own timing, not the clip's duration, which can differ from the audio's
      // length (a video's container, a part-filled last bucket). Each bucket then sits at its time.
      style={{ width: (buckets / peaks.perSecond) * pixelsPerSecond }}
      viewBox={`0 -1 ${buckets} 2`}
      preserveAspectRatio="none"
      data-testid="waveform"
    >
      <path d={outline(peaks)} fill={color} />
    </svg>
  )
}
