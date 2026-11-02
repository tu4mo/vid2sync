/** The track icons' area, lined up under the toolbar's play button: its inset and width. */
export const TRACK_ICON_INSET_PX = 16
export const TRACK_ICON_WIDTH_PX = 38
/** Room before 0:00 and after the end, so clips don't run into the viewport's edges. At the start it clears the track icons the clips scroll over, by the gap between the toolbar's buttons. */
export const EDGE_PX = TRACK_ICON_INSET_PX + TRACK_ICON_WIDTH_PX + 10

export const SYNC_LANE_HEIGHT = 20
/** Empty room above and below the lanes, to scrub the playhead in. As tall as the sync lane, so the gaps around the lanes match. */
export const SCRUB_STRIP_HEIGHT = SYNC_LANE_HEIGHT
/** The video and audio lanes share whatever height is left, down to this. */
export const LANE_MIN_HEIGHT = 56
export const LANE_DEFAULT_HEIGHT = 72

// Scrub strip, video lane, sync lane, audio lane, scrub strip.
export const ROWS = `${SCRUB_STRIP_HEIGHT}px minmax(${LANE_MIN_HEIGHT}px, 1fr) ${SYNC_LANE_HEIGHT}px minmax(${LANE_MIN_HEIGHT}px, 1fr) ${SCRUB_STRIP_HEIGHT}px`
