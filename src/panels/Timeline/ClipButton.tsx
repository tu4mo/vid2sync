import type { ComponentProps } from 'react'

// Full class names, so Tailwind finds them in the source.
const VARIANTS = {
  default: 'hover:border-line-strong',
  danger: 'hover:border-danger hover:text-danger',
}

type Props = {
  variant?: keyof typeof VARIANTS
} & ComponentProps<'button'>

/** A small icon button on a clip, as tall and rounded as the clip's label. */
export function ClipButton({
  variant = 'default',
  className = '',
  ...props
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex h-4.5 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-panel-2 px-1.5 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
