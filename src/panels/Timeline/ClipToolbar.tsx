import {
  Delete02Icon,
  AudioWave01Icon,
  Video01Icon,
  VolumeHighIcon,
  VolumeOffIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Slider } from '../../components/Slider/Slider'
import type { TrackKind } from '../../lib/media'
import { ClipButton } from './ClipButton'

const LABELS: Record<TrackKind, string> = { video: 'Video', audio: 'Audio' }
const ICONS = { video: Video01Icon, audio: AudioWave01Icon }
// Full class names, so Tailwind finds them in the source. A shade off the clip's own background.
const KIND_BACKGROUNDS: Record<TrackKind, string> = {
  video: 'bg-video/70',
  audio: 'bg-audio/70',
}

type Props = {
  kind: TrackKind
  volume: number
  onVolumeChange: (kind: TrackKind, volume: number) => void
  onRemove: (kind: TrackKind) => void
}

/** The kind strip down a clip's left side, and the buttons next to it, the volume icon opening a slider on hover. Sticks to the left as the timeline scrolls. */
export function ClipToolbar({ kind, volume, onVolumeChange, onRemove }: Props) {
  const percent = Math.round(volume * 100)

  return (
    <div className="pointer-events-none sticky left-0 z-10 flex h-full max-w-full">
      <div
        className={`flex w-8 shrink-0 items-center justify-center ${KIND_BACKGROUNDS[kind]}`}
        role="img"
        aria-label={LABELS[kind]}
      >
        <HugeiconsIcon icon={ICONS[kind]} size={18} />
      </div>
      <div
        className="pointer-events-auto mt-1 ml-1 flex min-w-0 items-center gap-1 self-start"
        // Keep the buttons from dragging the clip (and capturing the pointer, which eats the click).
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ClipButton
          variant="danger"
          aria-label="Remove clip"
          onClick={() => onRemove(kind)}
          title="Remove clip (Delete)"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </ClipButton>
        {/* The volume icon and slider share one block. The slider slides out on hover or focus, and stays out while it has focus, so dragging past it doesn't close it. */}
        <div className="group flex h-4.5 min-w-0 shrink-0 items-center overflow-hidden rounded border border-line bg-panel-2 hover:border-line-strong has-[:focus-visible]:border-line-strong">
          <span className="inline-flex h-full shrink-0 items-center px-1.5">
            <HugeiconsIcon
              icon={volume === 0 ? VolumeOffIcon : VolumeHighIcon}
              size={12}
            />
          </span>
          {/* Grid columns animate from 0fr to 1fr, so the slider slides to its natural width. */}
          <div className="grid h-full grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover:grid-cols-[1fr] group-has-[input:focus]:grid-cols-[1fr] motion-reduce:transition-none">
            <div className="min-w-0 overflow-hidden">
              <div className="flex h-full w-max items-center gap-1 pr-1.5 pl-1">
                <Slider
                  className="w-16"
                  aria-label="Volume"
                  min={0}
                  max={2}
                  step={0.01}
                  value={volume}
                  onChange={(e) => onVolumeChange(kind, Number(e.target.value))}
                  onDoubleClick={() => onVolumeChange(kind, 1)}
                  title={`Volume ${percent}% (double-click to reset)`}
                />
                <span className="w-[4ch] text-right text-2xs tabular-nums">
                  {percent}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
