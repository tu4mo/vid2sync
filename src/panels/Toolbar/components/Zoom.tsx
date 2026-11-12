import { ZoomInIcon, ZoomOutIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '../../../components/Button/Button'
import { Slider } from '../../../components/Slider/Slider'
import { MAX_ZOOM, stepZoom } from '../../../lib/zoom'

type Props = {
  /** The zoom level, 0–`MAX_ZOOM`. */
  zoom: number
  disabled: boolean
  onZoom: (zoom: number) => void
}

/** The zoom out and in buttons with a slider between them. */
export function Zoom({ zoom, disabled, onZoom }: Props) {
  return (
    <>
      <Button
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => onZoom(stepZoom(zoom, -1))}
        disabled={disabled || zoom <= 0}
      >
        <HugeiconsIcon icon={ZoomOutIcon} size={16} />
      </Button>
      <Slider
        className="w-28"
        aria-label="Zoom"
        min={0}
        max={MAX_ZOOM}
        value={zoom}
        disabled={disabled}
        onChange={(e) => onZoom(Number(e.target.value))}
      />
      <Button
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => onZoom(stepZoom(zoom, 1))}
        disabled={disabled || zoom >= MAX_ZOOM}
      >
        <HugeiconsIcon icon={ZoomInIcon} size={16} />
      </Button>
    </>
  )
}
