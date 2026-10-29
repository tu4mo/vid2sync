import type { ComponentProps } from 'react'

// Full class names, so Tailwind finds them in the source. Variants and sizes own every class they
// set, so a className passed in never has to win a conflict with them.
const VARIANTS = {
  default: 'border-line bg-panel-2 enabled:hover:border-line-strong',
  primary: 'border-accent bg-accent font-semibold text-[#1a1206]',
  danger: 'border-line bg-panel-2 enabled:hover:border-danger enabled:hover:text-danger',
}
const SIZES = {
  md: 'px-2.5 py-1',
  sm: 'px-1.5 py-0 text-2xs font-bold',
}

interface Props extends ComponentProps<'button'> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
}

export function Button({ variant = 'default', size = 'md', className = '', ...props }: Props) {
  return (
    <button
      type="button"
      className={`cursor-pointer rounded-md border disabled:cursor-default disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}
