import {
  CenterFocusIcon,
  Download01Icon,
  MagicWand01Icon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '../../components/Button/Button'
import type { AutoSync } from '../../lib/autoSync'
import { TOOLBAR_HEIGHT_PX } from '../../lib/layout'
import { Sparkles } from './components/Sparkles'
import { Zoom } from './components/Zoom'

/** The nudge buttons either side of the wand, in ms. */
const NUDGES_BEFORE = [-5, -1]
const NUDGES_AFTER = [1, 5]

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
  onSeek: (time: number) => void
  onExport: () => void
  /** Moves the clips to this sync offset (see `syncOffsetOf`). */
  onAutoSync: (syncOffset: number) => void
  /** How many times auto-sync has finished; the wand sparkles each time it goes up. */
  autoSyncCount: number
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
  autoSyncCount,
  canNudge,
  onNudge,
  onZoom,
  onToggleFollowPlayhead,
}: Props) {
  const empty = !hasClips

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
        <Sparkles count={autoSyncCount}>
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
        </Sparkles>
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
        <Zoom
          pixelsPerSecond={pixelsPerSecond}
          disabled={empty}
          onZoom={onZoom}
        />
      </div>
    </fieldset>
  )
}
