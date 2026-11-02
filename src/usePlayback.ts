import { useEffect, useEffectEvent, useState } from 'react'

import { TRACK_KINDS, clipsEnd, type Clips, type Volumes } from './lib/clip'
import { Playback } from './lib/playback'

// One for the whole app, outside React, so StrictMode's double mount doesn't open a second
// AudioContext.
const playback = new Playback()

/**
 * Connects the Web Audio playback to React: keeps it fed with the clips and volumes, and drives
 * the playhead from its clock while playing.
 */
export function usePlayback(clips: Clips, volume: Volumes) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const end = clipsEnd(clips)

  /** Pauses, and returns where the playhead stopped. */
  function pause() {
    playback.pause()
    const t = playback.now()
    setTime(t)
    setPlaying(false)
    return t
  }

  /** Stops playback with the playhead parked at `t`. */
  function stopAt(t: number) {
    playback.pause()
    playback.seek(t)
    setTime(t)
    setPlaying(false)
  }

  function play() {
    if (end === 0) {
      return
    }
    playback.play(time)
    setPlaying(true)
  }

  function seek(t: number) {
    const clamped = Math.max(0, t)
    playback.seek(clamped)
    setTime(clamped)
  }

  const stopAtEnd = useEffectEvent(() => stopAt(end))

  // Playback loop: read the audio clock and drive the playhead.
  useEffect(() => {
    if (!playing) {
      return
    }
    let raf = 0
    function tick() {
      const t = playback.now()
      // Stop when playback runs off the end of the clips, but not when it was started past it.
      // Started past it, the Timeline stops it at the end of the empty timeline instead.
      if (t >= end && playback.startedFrom() < end) {
        stopAtEnd()
        return
      }
      setTime(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, end])

  useEffect(() => {
    playback.setClips(clips)
  }, [clips])

  useEffect(() => {
    for (const kind of TRACK_KINDS) {
      playback.setGain(kind, volume[kind])
    }
  }, [volume])

  return {
    /** The playhead, in seconds. */
    time,
    playing,
    /** Where the last clip ends. */
    end,
    play,
    pause,
    stopAt,
    seek,
    /** For decoding files' audio. */
    ctx: playback.ctx,
  }
}
