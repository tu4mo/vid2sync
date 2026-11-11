import { useEffect, useEffectEvent, useState } from 'react'

import { TRACK_KINDS, clipsEnd, type Clips, type Volumes } from '../lib/clip'
import { Playback } from '../lib/playback'

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
    const stoppedAt = playback.now()
    setTime(stoppedAt)
    setPlaying(false)
    return stoppedAt
  }

  /** Stops playback with the playhead parked at `target`. */
  function stopAt(target: number) {
    playback.stopAt(target)
    setTime(target)
    setPlaying(false)
  }

  function play() {
    if (end === 0) {
      return
    }
    playback.play(time)
    setPlaying(true)
  }

  function seek(target: number) {
    const clamped = Math.max(0, target)
    playback.seek(clamped)
    setTime(clamped)
  }

  const stopAtEnd = useEffectEvent(() => stopAt(end))

  // Playback loop: read the audio clock and drive the playhead.
  useEffect(() => {
    if (!playing) {
      return
    }
    let frame = 0
    function tick() {
      const now = playback.now()
      // Stop when playback runs off the end of the clips, but not when it was started past it.
      // Started past it, the Timeline stops it at the end of the empty timeline instead
      // (`onPlayPastTimeline`).
      if (now >= end && playback.startedFrom() < end) {
        stopAtEnd()
        return
      }
      setTime(now)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
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
    audioContext: playback.audioContext,
  }
}
