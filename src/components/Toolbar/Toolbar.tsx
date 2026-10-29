import {
  Download01Icon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { formatTime, type TimeRange } from '../../media'
import { Button } from '../Button/Button'
import { Slider } from '../Slider/Slider'
import { MAX_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND } from '../Timeline/Timeline'

/** How much one press of a zoom button zooms. */
const ZOOM_STEP = 1.5

interface Props {
  playing: boolean
  time: number
  end: number
  range: TimeRange | null
  canExport: boolean
  exportProgress: number | null
  pixelsPerSecond: number
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onExport: () => void
  onZoom: (pixelsPerSecond: number) => void
}

export function Toolbar(props: Props) {
  const { playing, time, end, range, canExport, exportProgress, pixelsPerSecond } = props
  const { onPlay, onPause, onSeek, onExport, onZoom } = props
  const zoomBy = (factor: number) =>
    onZoom(
      Math.min(MAX_PIXELS_PER_SECOND, Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond * factor)),
    )
  return (
    <div className="flex items-center gap-2.5 border-t border-line bg-panel px-4 py-2">
      <Button
        variant="primary"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        onClick={playing ? onPause : onPlay}
        disabled={end === 0}
      >
        <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} size={16} />
      </Button>
      <Button aria-label="Go to start" title="Go to start (Home)" onClick={() => onSeek(0)}>
        <HugeiconsIcon icon={PreviousIcon} size={16} />
      </Button>
      <span className="font-mono tabular-nums" data-testid="clock">
        {formatTime(time)} <span className="text-dim">/ {formatTime(end)}</span>
      </span>
      <span className="ml-auto font-mono text-xs whitespace-nowrap" data-testid="range">
        {range ? (
          <>
            {formatTime(range.start)} – {formatTime(range.end)}{' '}
            <span className="text-dim">({(range.end - range.start).toFixed(2)} s)</span>
          </>
        ) : (
          <span className="text-dim">Whole video</span>
        )}
      </span>
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
          min={Math.log(MIN_PIXELS_PER_SECOND)}
          max={Math.log(MAX_PIXELS_PER_SECOND)}
          step={0.01}
          value={Math.log(pixelsPerSecond)}
          onChange={(e) => onZoom(Math.exp(Number(e.target.value)))}
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
  )
}
