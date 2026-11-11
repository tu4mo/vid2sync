import { ROWS } from '../../../lib/layout'
import { TrackIcon } from './TrackIcon'

/** The track icons, in a column along the timeline's left edge, lined up with the lanes. */
export function TrackIcons() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 grid"
      style={{ gridTemplateRows: ROWS }}
    >
      <div />
      <TrackIcon kind="video" />
      <div />
      <TrackIcon kind="audio" />
      <div />
    </div>
  )
}
