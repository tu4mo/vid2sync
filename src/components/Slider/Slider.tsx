import type { ComponentProps, CSSProperties } from 'react'

// The native slider draws a border around its track, so it's drawn here instead. WebKit has no
// pseudo-element for the filled part, so the track paints it as a gradient up to --fill.
const CLASSES =
  'h-3.5 cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-40 ' +
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full ' +
  '[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-dim)_var(--fill),var(--color-line)_var(--fill))] ' +
  '[&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fg ' +
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line ' +
  '[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-dim ' +
  '[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-fg'

type Props = {
  min: number
  max: number
  value: number
} & Omit<ComponentProps<'input'>, 'type' | 'min' | 'max' | 'value'>

export function Slider({
  min,
  max,
  value,
  className = '',
  style,
  ...props
}: Props) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      className={`${CLASSES} ${className}`}
      style={{ '--fill': `${fill}%`, ...style } as CSSProperties}
      min={min}
      max={max}
      value={value}
      {...props}
    />
  )
}
