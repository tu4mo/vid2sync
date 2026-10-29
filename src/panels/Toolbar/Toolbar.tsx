import {
  Download01Icon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '../../components/Button/Button'
import { Slider } from '../../components/Slider/Slider'
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  clampZoom,
} from '../../lib/zoom'

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
  playing: boolean
  end: number
  canExport: boolean
  exportProgress: number | null
  pixelsPerSecond: number
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onExport: () => void
  onZoom: (pixelsPerSecond: number) => void
}

export function Toolbar({
  playing,
  end,
  canExport,
  exportProgress,
  pixelsPerSecond,
  onPlay,
  onPause,
  onSeek,
  onExport,
  onZoom,
}: Props) {
  function zoomBy(factor: number) {
    onZoom(clampZoom(pixelsPerSecond * factor))
  }
  return (
    // Three columns, so the transport buttons stay centred whatever sits either side.
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 bg-panel px-4 py-2">
      <h1 className="flex items-center gap-2 font-logo text-base tracking-[0.02em] text-dim">
        <img
          src={`${import.meta.env.BASE_URL}favicon.png`}
          alt=""
          className="size-6"
        />
        vid2sync
      </h1>
      <div className="flex items-center gap-2.5">
        <Button
          variant="primary"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={playing ? onPause : onPlay}
          disabled={end === 0}
        >
          <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={16} />
        </Button>
        <Button
          aria-label="Go to start"
          title="Go to start (Home)"
          onClick={() => onSeek(0)}
        >
          <HugeiconsIcon icon={PreviousIcon} size={16} />
        </Button>
      </div>
      <div className="flex items-center justify-end gap-2.5">
        <Button
          className="tabular-nums"
          aria-label="Export MP4"
          onClick={onExport}
          disabled={!canExport || exportProgress !== null}
          title="Save the video with the synced audio as MP4"
        >
          <HugeiconsIcon icon={Download01Icon} size={16} />
          {exportProgress !== null && `${Math.round(exportProgress * 100)}%`}
        </Button>
        <div className="ml-3 flex items-center gap-2">
          <Button
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            disabled={pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
          >
            <HugeiconsIcon icon={ZoomOutIcon} size={16} />
          </Button>
          <Slider
            className="w-32"
            aria-label="Zoom"
            min={0}
            max={100}
            value={zoomToSlider(pixelsPerSecond)}
            onChange={(e) => onZoom(sliderToZoom(Number(e.target.value)))}
          />
          <Button
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
          >
            <HugeiconsIcon icon={ZoomInIcon} size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}
