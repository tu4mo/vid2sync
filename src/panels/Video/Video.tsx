import { useEffect, useRef } from 'react'

import { clipSpan, type Clip } from '../../lib/media'

/** Parks the video at timeline time `t`, or with `play`, plays it in step with `t`. */
function syncVideo(el: HTMLVideoElement, clip: Clip, t: number, play: boolean) {
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

type Props = {
  clip: Clip | null
  time: number
  playing: boolean
  muted: boolean
  volume: number
}

/** The video preview, kept in step with the playhead. */
export function Video({ clip, time, playing, muted, volume }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const span = clip && clipSpan(clip)
  // Whether the playhead is on the clip's trimmed part.
  const inside = !!span && time >= span.start && time < span.end

  useEffect(() => {
    if (ref.current && clip) {
      syncVideo(ref.current, clip, time, playing && inside)
    }
  }, [clip, time, playing, inside])

  // The video element only plays its own sound when Web Audio couldn't decode it.
  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    el.muted = muted || !!clip?.buffer
    el.volume = Math.min(1, volume)
  }, [muted, volume, clip])

  return (
    <main className="relative flex h-full items-center justify-center bg-black">
      {clip ? (
        <video
          ref={ref}
          src={clip.url}
          className="max-h-full max-w-full"
          playsInline
          preload="auto"
          style={{ visibility: inside ? 'visible' : 'hidden' }}
        />
      ) : (
        <div className="text-dim">Import a video to preview it here</div>
      )}
    </main>
  )
}
