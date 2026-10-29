import {
  Delete02Icon,
  VolumeHighIcon,
  VolumeOffIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Button } from '../../components/Button/Button'
import { Slider } from '../../components/Slider/Slider'
import type { Clip, TrackKind } from '../../lib/media'

const LABELS: Record<TrackKind, string> = { video: 'Video', audio: 'Audio' }
// Full class names, so Tailwind finds them in the source.
const HEAD_BORDERS: Record<TrackKind, string> = {
  video: 'border-l-video',
  audio: 'border-l-audio',
}

type Props = {
  kind: TrackKind
  clip: Clip | null
  muted: boolean
  volume: number
  loading: boolean
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  onRemove: () => void
}

export function TrackHead({
  kind,
  clip,
  muted,
  volume,
  loading,
  onToggleMute,
  onVolumeChange,
  onRemove,
}: Props) {
  const percent = Math.round(volume * 100)
  return (
    <div
      className={`flex flex-col justify-center gap-[3px] border-b border-l-3 border-b-line px-2.5 ${HEAD_BORDERS[kind]}`}
      data-track={kind}
      data-testid={`head-${kind}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-semibold">{LABELS[kind]}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-dim">
          {loading && 'Loading…'}
        </span>
        <Button
          size="sm"
          className="aria-pressed:border-danger aria-pressed:bg-danger aria-pressed:text-white"
          aria-label="Mute"
          aria-pressed={muted}
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          <HugeiconsIcon
            icon={muted ? VolumeOffIcon : VolumeHighIcon}
            size={12}
          />
        </Button>
        {clip && (
          <Button
            variant="danger"
            size="sm"
            aria-label="Remove clip"
            onClick={onRemove}
            title="Remove clip (Delete)"
          >
            <HugeiconsIcon icon={Delete02Icon} size={12} />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Slider
          className="min-w-0 flex-1"
          min={0}
          max={2}
          step={0.01}
          value={volume}
          disabled={muted}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          onDoubleClick={() => onVolumeChange(1)}
          title={`Volume ${percent}% (double-click to reset)`}
        />
        <span className="w-[34px] text-right text-2xs text-dim tabular-nums">
          {percent}%
        </span>
      </div>
    </div>
  )
}
