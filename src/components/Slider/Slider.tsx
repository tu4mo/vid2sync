import { clsx } from 'clsx'
import type { ComponentProps } from 'react'

// The native slider draws a border around its track, so it's drawn here instead.
const CLASSES = [
  'h-3.5 cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-40',
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-line',
  '[&::-webkit-slider-thumb]:-mt-0.5 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow',
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-line',
  '[&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow',
]

type Props = {
  min: number
  max: number
  value: number
} & Omit<ComponentProps<'input'>, 'type' | 'min' | 'max' | 'value'>

export function Slider({ min, max, value, className, ...props }: Props) {
  return (
    <input
      type="range"
      className={clsx(CLASSES, className)}
      min={min}
      max={max}
      value={value}
      {...props}
    />
  )
}
