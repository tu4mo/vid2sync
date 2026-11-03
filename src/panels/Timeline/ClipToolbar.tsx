import {
  Delete02Icon,
  VolumeHighIcon,
  VolumeOffIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { Slider } from '../../components/Slider/Slider'
import { EDGE_PX, TOOLBAR_INSET_PX } from '../../layout'
import type { TrackKind } from '../../lib/clip'

/** The buttons' gap from the clip's start. */
const INSET_PX = 4
/** Where the toolbar sticks, so the buttons line up under the play button. Sticky offsets count
 * from inside the timeline's padding, so it's taken back off. */
const STICKY_LEFT_PX = TOOLBAR_INSET_PX - EDGE_PX - INSET_PX

// The remove button and the volume block, as tall and rounded as the clip's label.
const CHIP =
  'flex h-4.5 shrink-0 items-center rounded bg-panel-2'

type Props = {
  kind: TrackKind
  volume: number
  onVolumeChange: (kind: TrackKind, volume: number) => void
  onRemove: (kind: TrackKind) => void
}

/** A clip's buttons, the volume icon opening a slider on hover. Sticks to the left as the timeline scrolls. */
export function ClipToolbar({ kind, volume, onVolumeChange, onRemove }: Props) {
  const percent = Math.round(volume * 100)

  return (
    // As wide as the buttons, not the clip: a sticky box as wide as its parent has no room to move.
    // Over the fade shade (z-10), under the fade dots (z-30), so the dots stay grabbable.
    <div
      className="pointer-events-none sticky z-20 flex h-full w-max max-w-full"
      style={{ left: STICKY_LEFT_PX }}
    >
      <div
        className="pointer-events-auto flex min-w-0 items-center gap-1 self-center"
        style={{ marginLeft: INSET_PX }}
        // Keep the buttons from dragging the clip (and capturing the pointer, which eats the click).
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`${CHIP} cursor-pointer justify-center px-1.5 hover:text-danger`}
          aria-label="Remove clip"
          onClick={() => onRemove(kind)}
          title="Remove clip (Delete)"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} />
        </button>
        {/* The volume icon and slider share one block. The slider slides out on hover or focus, and stays out while it has focus, so dragging past it doesn't close it. */}
        <div
          className={`group/volume ${CHIP} min-w-0 cursor-default overflow-hidden`}
        >
          <span className="inline-flex h-full shrink-0 items-center px-1.5">
            <HugeiconsIcon
              icon={volume === 0 ? VolumeOffIcon : VolumeHighIcon}
              size={12}
            />
          </span>
          {/* Grid columns animate from 0fr to 1fr, so the slider slides to its natural width. */}
          <div className="grid h-full grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-out group-hover/volume:grid-cols-[1fr] group-has-[input:focus]/volume:grid-cols-[1fr] motion-reduce:transition-none">
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
