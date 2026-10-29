// Shared by the track heads and the lanes, so the two columns line up.
export const RULER_HEIGHT = 28
export const SYNC_LANE_HEIGHT = 26
/** The video and audio lanes share whatever height is left, down to this. */
export const LANE_MIN_HEIGHT = 56
export const LANE_DEFAULT_HEIGHT = 72

// Ruler, video lane, sync lane, audio lane.
export const ROWS = `${RULER_HEIGHT}px minmax(${LANE_MIN_HEIGHT}px, 1fr) ${SYNC_LANE_HEIGHT}px minmax(${LANE_MIN_HEIGHT}px, 1fr)`
