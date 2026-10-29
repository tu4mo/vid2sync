import {
  CenterFocusIcon,
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
  followPlayhead: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onExport: () => void
  onZoom: (pixelsPerSecond: number) => void
  onToggleFollowPlayhead: () => void
}

export function Toolbar({
  playing,
  end,
  canExport,
  exportProgress,
  pixelsPerSecond,
  followPlayhead,
  onPlay,
  onPause,
  onSeek,
  onExport,
  onZoom,
  onToggleFollowPlayhead,
}: Props) {
  // Nothing imported yet, so there's nothing to play or zoom.
  const empty = end === 0

  function zoomBy(factor: number) {
    onZoom(clampZoom(pixelsPerSecond * factor))
  }
  return (
    <div className="flex items-center justify-between gap-2.5 bg-panel px-4 py-2">
      <div className="flex items-center gap-2.5">
        <Button
          variant="primary"
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={playing ? onPause : onPlay}
          disabled={empty}
        >
          <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={16} />
        </Button>
        <Button
          aria-label="Go to start"
          title="Go to start (Home)"
          onClick={() => onSeek(0)}
          disabled={empty}
        >
          <HugeiconsIcon icon={PreviousIcon} size={16} />
        </Button>
        <Button
          className="ml-3 tabular-nums"
          aria-label="Export MP4"
          onClick={onExport}
          disabled={!canExport || exportProgress !== null}
          title="Save the video with the synced audio as MP4"
        >
          <HugeiconsIcon icon={Download01Icon} size={16} />
          {exportProgress !== null && `${Math.round(exportProgress * 100)}%`}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          className="aria-pressed:text-accent"
          aria-label="Follow playhead"
          aria-pressed={followPlayhead}
          title="Follow playhead"
          onClick={onToggleFollowPlayhead}
          disabled={empty}
        >
          <HugeiconsIcon icon={CenterFocusIcon} size={16} />
        </Button>
        <Button
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          disabled={empty || pixelsPerSecond <= MIN_PIXELS_PER_SECOND}
        >
          <HugeiconsIcon icon={ZoomOutIcon} size={16} />
        </Button>
        <Slider
          className="w-32"
          aria-label="Zoom"
          min={0}
          max={100}
          value={zoomToSlider(pixelsPerSecond)}
          disabled={empty}
          onChange={(e) => onZoom(sliderToZoom(Number(e.target.value)))}
        />
        <Button
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP)}
          disabled={empty || pixelsPerSecond >= MAX_PIXELS_PER_SECOND}
        >
          <HugeiconsIcon icon={ZoomInIcon} size={16} />
        </Button>
      </div>
    </div>
  )
}
