import {
  CenterFocusIcon,
  Download01Icon,
  MagicWand01Icon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '../../components/Button/Button'
import { Slider } from '../../components/Slider/Slider'
import type { AutoSync } from '../../lib/autoSync'
import { TOOLBAR_HEIGHT_PX } from '../../lib/layout'
import {
  MAX_PIXELS_PER_SECOND,
  MIN_PIXELS_PER_SECOND,
  clampZoom,
} from '../../lib/zoom'

/** The nudge buttons either side of the wand, in ms. */
const NUDGES_BEFORE = [-5, -1]
const NUDGES_AFTER = [1, 5]

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

/** The sync button's tooltip, which says why it's disabled when it is. */
function autoSyncTitle(autoSync: AutoSync) {
  switch (autoSync.status) {
    case 'none':
      return autoSync.reason
    case 'matched':
      return 'Sync the audio to the video by their sound'
  }
}

type Props = {
  /** Disables every control, while something runs that the clips mustn't change under. */
  disabled: boolean
  playing: boolean
  /** Nothing to play or zoom until there's a clip. */
  hasClips: boolean
  canExport: boolean
  autoSync: AutoSync
  pixelsPerSecond: number
  followPlayhead: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onExport: () => void
  /** Moves the clips to this sync offset (see `syncOffsetOf`). */
  onAutoSync: (syncOffset: number) => void
  /** Whether there's a selected clip to nudge. */
  canNudge: boolean
  /** Moves the selected clip by this many ms. */
  onNudge: (ms: number) => void
  onZoom: (pixelsPerSecond: number) => void
  onToggleFollowPlayhead: () => void
}

export function Toolbar({
  disabled,
  playing,
  hasClips,
  canExport,
  autoSync,
  pixelsPerSecond,
  followPlayhead,
  onPlay,
  onPause,
  onSeek,
  onExport,
  onAutoSync,
  canNudge,
  onNudge,
  onZoom,
  onToggleFollowPlayhead,
}: Props) {
  const empty = !hasClips

  function zoomBy(factor: number) {
    onZoom(clampZoom(pixelsPerSecond * factor))
  }

  function nudgeButton(ms: number) {
    const label = `Move ${Math.abs(ms)} ms ${ms > 0 ? 'later' : 'earlier'}`
    return (
      <Button
        key={ms}
        className="tabular-nums"
        aria-label={label}
        title={canNudge ? label : `${label} (select a clip first)`}
        data-testid={`nudge-${ms}`}
        onClick={() => onNudge(ms)}
        disabled={!canNudge}
      >
        {ms > 0 ? `+${ms}` : ms}
      </Button>
    )
  }

  return (
    // A fieldset, so disabling it disables every control in it, each with its usual disabled look.
    // Three columns, the outer two equal, so the nudge and sync controls sit in the middle.
    <fieldset
      className="grid min-w-0 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2.5 border-b border-line bg-panel px-4"
      style={{ height: TOOLBAR_HEIGHT_PX }}
      disabled={disabled}
    >
      <div className="flex items-center gap-2">
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
          className="ml-3"
          aria-label="Export MP4"
          onClick={onExport}
          disabled={!canExport}
          title="Save the video with the synced audio as MP4"
        >
          <HugeiconsIcon icon={Download01Icon} size={16} />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {NUDGES_BEFORE.map(nudgeButton)}
        <Button
          aria-label="Sync automatically"
          data-testid="auto-sync"
          onClick={() => {
            if (autoSync.status === 'matched') {
              onAutoSync(autoSync.syncOffset)
            }
          }}
          disabled={autoSync.status !== 'matched'}
          title={autoSyncTitle(autoSync)}
        >
          <HugeiconsIcon icon={MagicWand01Icon} size={16} />
        </Button>
        {NUDGES_AFTER.map(nudgeButton)}
      </div>
      <div className="flex items-center gap-2 justify-self-end">
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
          className="w-28"
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
    </fieldset>
  )
}
