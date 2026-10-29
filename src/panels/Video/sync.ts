import type { Clip } from '../../lib/media'

/** Parks the video at timeline time `t`, or with `play`, plays it in step with `t`. */
export function syncVideo(
  el: HTMLVideoElement,
  clip: Clip,
  t: number,
  play: boolean,
) {
  const local = t - clip.offset

  if (!play) {
    if (!el.paused) {
      el.pause()
    }
    el.playbackRate = 1
    const target = Math.min(Math.max(local, clip.trim.start), clip.trim.end)
    if (Math.abs(el.currentTime - target) > 0.005) {
      el.currentTime = target
    }
    return
  }

  // Audio is the master clock; nudge the video's rate to follow it, and hard-seek on big jumps.
  const drift = el.currentTime - local
  if (Math.abs(drift) > 0.3) {
    el.currentTime = local
  } else {
    el.playbackRate = Math.min(1.1, Math.max(0.9, 1 - drift * 2))
  }
  if (el.paused) {
    void el.play().catch(() => {})
  }
}
