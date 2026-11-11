import { AudioWave01Icon, Video01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import type { TrackKind } from '../../../lib/clip'
import { TRACK_ICON_INSET_PX, TRACK_ICON_WIDTH_PX } from '../../../lib/layout'

const LABELS: Record<TrackKind, string> = { video: 'Video', audio: 'Audio' }
const ICONS = { video: Video01Icon, audio: AudioWave01Icon }

type Props = {
  kind: TrackKind
}

/** A track's icon, at the start of its lane, under the clips. */
export function TrackIcon({ kind }: Props) {
  return (
    <div
      className="flex items-center justify-center text-dim/50"
      style={{ marginLeft: TRACK_ICON_INSET_PX, width: TRACK_ICON_WIDTH_PX }}
      role="img"
      aria-label={LABELS[kind]}
    >
      <HugeiconsIcon icon={ICONS[kind]} size={24} />
    </div>
  )
}
