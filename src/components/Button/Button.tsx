import type { ComponentProps } from 'react'

// Full class names, so Tailwind finds them in the source. Variants own every class they set, so a
// className passed in never has to win a conflict with them.
const VARIANTS = {
  default: 'border-line bg-panel-2 enabled:hover:border-line-strong',
  primary: 'border-accent bg-accent font-semibold text-[#1a1206]',
  danger:
    'border-line bg-panel-2 enabled:hover:border-danger enabled:hover:text-danger',
}

type Props = {
  variant?: keyof typeof VARIANTS
} & ComponentProps<'button'>

export function Button({
  variant = 'default',
  className = '',
  ...props
}: Props) {
  return (
    // A fixed height, so buttons line up whether they hold text, an icon or both.
    <button
      type="button"
      className={`inline-flex h-6.5 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 disabled:cursor-default disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
