import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export function Spinner() {
  return (
    <HugeiconsIcon
      className="animate-spin text-accent"
      icon={Loading03Icon}
      size={20}
    />
  )
}
