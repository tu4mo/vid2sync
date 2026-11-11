import type { Clip } from '../../../lib/clip'

/** Parks the video at `timelineTime`, or with `play`, plays it in step with `timelineTime`. */
export function syncVideo(
  video: HTMLVideoElement,
  clip: Clip,
  timelineTime: number,
  play: boolean,
) {
  const clipTime = timelineTime - clip.offset

  if (!play) {
    if (!video.paused) {
      video.pause()
    }
    video.playbackRate = 1
    const target = Math.min(Math.max(clipTime, clip.trim.start), clip.trim.end)
    if (Math.abs(video.currentTime - target) > 0.005) {
      video.currentTime = target
    }
    return
  }

  // Audio is the master clock; nudge the video's rate to follow it, and hard-seek on big jumps.
  const drift = video.currentTime - clipTime
  if (Math.abs(drift) > 0.3) {
    video.currentTime = clipTime
  } else {
    video.playbackRate = Math.min(1.1, Math.max(0.9, 1 - drift * 2))
  }
  if (video.paused) {
    void video.play().catch(() => {})
  }
}
