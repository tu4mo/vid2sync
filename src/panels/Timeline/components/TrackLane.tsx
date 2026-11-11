import type { ComponentProps } from 'react'

import type { Clips, TrackKind, Volumes } from '../../../lib/clip'
import { EDGE_PX } from '../../../lib/layout'
import { ClipView } from './ClipView/ClipView'
import { ImportPrompt } from './ImportPrompt'

const DROP_WHAT: Record<TrackKind, string> = {
  video: 'a video file',
  audio: 'an audio file',
}

type Props = Omit<
  ComponentProps<typeof ClipView>,
  'clip' | 'selected' | 'volume'
> & {
  clips: Clips
  selected: TrackKind | null
  volume: Volumes
  /** The scroll viewport's width, which the import prompt is centred in. */
  viewport: number
  onImport: (files: File[]) => void
}

/** A track's lane: its clip, or a prompt to import one when the other track has a clip. */
export function TrackLane({
  kind,
  clips,
  selected,
  volume,
  viewport,
  onImport,
  ...clipProps
}: Props) {
  const clip = clips[kind]
  const hasClips = !!(clips.video || clips.audio)
  return (
    <div className="relative flex items-center">
      {/* With both tracks empty, the timeline-wide prompt covers it. */}
      {/* Sticky, not placed from `scrollLeft`, which lags the scroll by a frame. The outer box spans the padding too, so the prompt starts at the viewport's edge; sticky offsets count from inside the padding, so it's taken back off. */}
      {!clip && hasClips && (
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: -EDGE_PX, right: -EDGE_PX }}
        >
          <div
            className="sticky flex h-full items-center justify-center"
            style={{ left: -EDGE_PX, width: viewport }}
          >
            <ImportPrompt
              accept={`${kind}/*`}
              what={DROP_WHAT[kind]}
              onImport={onImport}
            />
          </div>
        </div>
      )}
      {clip && (
        <ClipView
          kind={kind}
          clip={clip}
          selected={selected === kind}
          volume={volume[kind]}
          {...clipProps}
        />
      )}
    </div>
  )
}
