import { formatTime } from '../../media'

interface Props {
  time: number
  pixelsPerSecond: number
}

/** The vertical line marking the current playback position, flagged with the time on top. */
export function Playhead({ time, pixelsPerSecond }: Props) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-3 w-0 -translate-x-px border-l-2 border-accent"
      style={{ left: time * pixelsPerSecond }}
    >
      <span
        className="absolute top-0 left-0 rounded-r-sm bg-accent px-1.5 py-0.5 font-mono text-2xs font-semibold whitespace-nowrap text-[#1a1206] tabular-nums"
        data-testid="clock"
      >
        {formatTime(time)}
      </span>
    </div>
  )
}
