type Props = {
  time: number
  pixelsPerSecond: number
}

/** The vertical line marking the current playback position. */
export function Playhead({ time, pixelsPerSecond }: Props) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-3 w-0 -translate-x-px border-l-2 border-accent"
      style={{ left: time * pixelsPerSecond }}
      data-testid="playhead"
      data-time={time}
    />
  )
}
