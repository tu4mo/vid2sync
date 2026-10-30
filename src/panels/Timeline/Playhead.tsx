type Props = {
  time: number
  pixelsPerSecond: number
}

/** The vertical line marking the current playback position, capped with a downward arrow. */
export function Playhead({ time, pixelsPerSecond }: Props) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-3 w-0.5 -translate-x-px bg-accent"
      style={{ left: time * pixelsPerSecond }}
      data-testid="playhead"
      data-time={time}
    >
      <div className="absolute top-0 left-1/2 h-1.5 w-2.5 -translate-x-1/2 bg-accent [clip-path:polygon(0_0,100%_0,50%_100%)]" />
    </div>
  )
}
