import { useEffect, useRef } from 'react'

import { clipSpan, type Clip } from '../../lib/media'
import { syncVideo } from './sync'

type Props = {
  clip: Clip | null
  time: number
  playing: boolean
  muted: boolean
  volume: number
}

/** The video preview, kept in step with the playhead. */
export function Preview({ clip, time, playing, muted, volume }: Props) {
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
        <h1 className="flex items-center gap-3 font-logo text-2xl tracking-[0.02em] text-white">
          <img
            src={`${import.meta.env.BASE_URL}favicon.png`}
            alt=""
            className="size-10"
          />
          vid2sync
        </h1>
      )}
    </main>
  )
}
