import { ZoomInIcon, ZoomOutIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '../../../components/Button/Button'
import { Slider } from '../../../components/Slider/Slider'
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  clampZoom,
} from '../../../lib/zoom'

/** How much one press of a zoom button zooms. */
const ZOOM_STEP = 1.5

const LOG_MIN = Math.log(MIN_PIXELS_PER_SECOND)
const LOG_RANGE = Math.log(MAX_PIXELS_PER_SECOND) - LOG_MIN

// The slider runs 0–100 on a log scale, so its native tooltip shows a tidy percentage
// rather than the raw logarithm.
function zoomToSlider(pixelsPerSecond: number) {
  return ((Math.log(pixelsPerSecond) - LOG_MIN) / LOG_RANGE) * 100
}

function sliderToZoom(value: number) {
  // Written as a power so the ends land exactly on the limits, which the zoom buttons check.
  return (
    MIN_PIXELS_PER_SECOND *
    (MAX_PIXELS_PER_SECOND / MIN_PIXELS_PER_SECOND) ** (value / 100)
  )
}

type Props = {
  pixelsPerSecond: number
  disabled: boolean
  onZoom: (pixelsPerSecond: number) => void
}

/** The zoom out and in buttons with a log-scale slider between them. */
export function Zoom({ pixelsPerSecond, disabled, onZoom }: Props) {
  function zoomBy(factor: number) {
    onZoom(clampZoom(pixelsPerSecond * factor))
  }

  return (
    <>
      <Button
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => zoomBy(1 / ZOOM_STEP)}
        disabled={disabled || pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
      >
        <HugeiconsIcon icon={ZoomOutIcon} size={16} />
      </Button>
      <Slider
        className="w-28"
        aria-label="Zoom"
        min={0}
        max={100}
        value={zoomToSlider(pixelsPerSecond)}
        disabled={disabled}
        onChange={(e) => onZoom(sliderToZoom(Number(e.target.value)))}
      />
      <Button
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => zoomBy(ZOOM_STEP)}
        disabled={disabled || pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
      >
        <HugeiconsIcon icon={ZoomInIcon} size={16} />
      </Button>
    </>
  )
}
