import type { ComponentProps } from 'react'

// Full class names, so Tailwind finds them in the source. Variants and sizes own every class they
// set, so a className passed in never has to win a conflict with them.
const VARIANTS = {
  default: 'border-line bg-panel-2 enabled:hover:border-line-strong',
  primary: 'border-accent bg-accent font-semibold text-[#1a1206]',
  danger:
    'border-line bg-panel-2 enabled:hover:border-danger enabled:hover:text-danger',
}
// Fixed heights, so buttons line up whether they hold text, an icon or both.
const SIZES = {
  md: 'h-6.5 gap-1.5 px-2.5',
  sm: 'h-4.5 gap-1 px-1.5 text-2xs font-bold',
}

type Props = {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
} & ComponentProps<'button'>

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center justify-center rounded-md border disabled:cursor-default disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}
