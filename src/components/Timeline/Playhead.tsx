interface Props {
  time: number
  pixelsPerSecond: number
}

/** The vertical line marking the current playback position, with a triangle on top. */
export function Playhead({ time, pixelsPerSecond }: Props) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 w-0 -translate-x-px border-l-2 border-accent before:absolute before:top-0 before:-left-[7px] before:border-6 before:border-t-8 before:border-transparent before:border-t-accent"
      style={{ left: time * pixelsPerSecond }}
    />
  )
}
