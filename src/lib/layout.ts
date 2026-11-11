/** How long auto-sync takes to glide the clips to their synced places. */
export const SYNC_TRANSITION_MS = 300

/** The toolbar's height, line under it included, for laying out the panel it sits in. */
export const TOOLBAR_HEIGHT_PX = 43

// These copy the toolbar's Tailwind classes, so things on the timeline line up with its buttons.
// Change them together with Toolbar.tsx and Button.tsx.
/** The toolbar's side padding (`px-4`), which puts the play button this far from the left edge. */
const TOOLBAR_INSET_PX = 16
/** A toolbar icon button's width: `px-2.5` either side, the 16px icon and a 1px border either side. */
const TOOLBAR_BUTTON_WIDTH_PX = 38
/** The gap between the toolbar's buttons (`gap-2.5`). */
const TOOLBAR_GAP_PX = 10

/** The track icons' area, lined up under the toolbar's play button: its inset and width. */
export const TRACK_ICON_INSET_PX = TOOLBAR_INSET_PX
export const TRACK_ICON_WIDTH_PX = TOOLBAR_BUTTON_WIDTH_PX
/** Room before 0:00 and after the end, so clips don't run into the viewport's edges. At the start it clears the track icons the clips scroll over, by the gap between the toolbar's buttons. */
export const EDGE_PX =
  TRACK_ICON_INSET_PX + TRACK_ICON_WIDTH_PX + TOOLBAR_GAP_PX

/** A sticky `left` that lines something on a clip up under the play button. Sticky offsets count from inside the timeline's padding, so it's taken back off. */
export const STICKY_UNDER_PLAY_LEFT_PX = TOOLBAR_INSET_PX - EDGE_PX

const SYNC_LANE_HEIGHT_PX = 24
/** Empty room above and below the lanes, to scrub the playhead in. As tall as the sync lane, so the gaps around the lanes match. */
const SCRUB_STRIP_HEIGHT_PX = SYNC_LANE_HEIGHT_PX
/** The video and audio lanes share whatever height is left, down to this. */
const LANE_MIN_HEIGHT_PX = 56
const LANE_DEFAULT_HEIGHT_PX = 72

/** Scrub strip, video lane, sync lane, audio lane, scrub strip. */
export const ROWS = `${SCRUB_STRIP_HEIGHT_PX}px minmax(${LANE_MIN_HEIGHT_PX}px, 1fr) ${SYNC_LANE_HEIGHT_PX}px minmax(${LANE_MIN_HEIGHT_PX}px, 1fr) ${SCRUB_STRIP_HEIGHT_PX}px`

// The scrub strips and sync lane, which don't stretch.
const FIXED_ROWS_HEIGHT_PX = 2 * SCRUB_STRIP_HEIGHT_PX + SYNC_LANE_HEIGHT_PX
/** The timeline's height with the lanes at their default height, and at their smallest. */
export const TIMELINE_HEIGHT_PX =
  FIXED_ROWS_HEIGHT_PX + 2 * LANE_DEFAULT_HEIGHT_PX
export const TIMELINE_MIN_HEIGHT_PX =
  FIXED_ROWS_HEIGHT_PX + 2 * LANE_MIN_HEIGHT_PX
