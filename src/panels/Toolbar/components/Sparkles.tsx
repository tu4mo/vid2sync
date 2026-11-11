import type { CSSProperties, ReactNode } from 'react'

/** Each sparkle's direction (degrees, 0 is right, clockwise), distance (px), size (px) and delay (ms). */
const SPARKLES = [
  { angle: -90, distance: 20, size: 9, delay: 0 },
  { angle: -30, distance: 22, size: 7, delay: 60 },
  { angle: 30, distance: 18, size: 6, delay: 120 },
  { angle: 90, distance: 20, size: 8, delay: 30 },
  { angle: 150, distance: 22, size: 7, delay: 90 },
  { angle: 210, distance: 18, size: 6, delay: 150 },
]

/** A four-pointed star, in a 10 by 10 box. */
const STAR_PATH = 'M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0Z'

/** One burst of sparkles out of the middle of its parent. Plays once, when mounted. */
function Burst() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 motion-reduce:hidden"
    >
      {SPARKLES.map(({ angle, distance, size, delay }) => {
        const radians = (angle * Math.PI) / 180
        const style = {
          '--sparkle-x': `${Math.cos(radians) * distance}px`,
          '--sparkle-y': `${Math.sin(radians) * distance}px`,
          'animationDelay': `${delay}ms`,
        } as CSSProperties
        return (
          <svg
            key={angle}
            className="absolute top-1/2 left-1/2 animate-sparkle text-accent"
            style={style}
            width={size}
            height={size}
            viewBox="0 0 10 10"
          >
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        )
      })}
    </span>
  )
}

type Props = {
  /** Bursts each time this goes up; nothing at 0. */
  count: number
  children: ReactNode
}

/** Wraps `children` so sparkles can burst out of them. */
export function Sparkles({ count, children }: Props) {
  return (
    <span className="relative inline-flex">
      {children}
      {/* Keyed by the count, so each new one remounts the burst and replays the animation. */}
      {count > 0 && <Burst key={count} />}
    </span>
  )
}
