import { describe, expect, it } from 'vitest'

import { autoSyncFor, findClipsSync, findSync, type Sound } from './autoSync'
import { testClip } from './testClip'

const RATE = 48000

/** Fakes a decoded file's AudioBuffer from its channels' samples. */
function sound(
  channels: Float32Array<ArrayBuffer>[],
  sampleRate = RATE,
): Sound {
  return {
    sampleRate,
    length: channels[0].length,
    numberOfChannels: channels.length,
    getChannelData: (c) => channels[c],
  }
}

/** A seeded random number generator, so the tests are the same every run. */
function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

/** A performance: decaying noise bursts (hits) at random times, as one long signal. */
function performance(seconds: number, seed: number, hitsPerSecond = 3) {
  const rand = random(seed)
  const out = new Float32Array(seconds * RATE)
  let t = rand() * 0.3
  while (t < seconds) {
    const start = Math.floor(t * RATE)
    const level = 0.2 + rand() * 0.8
    const decay = 0.02 + rand() * 0.1
    for (let i = 0; start + i < out.length && i < decay * 5 * RATE; i++) {
      out[start + i] += (rand() * 2 - 1) * level * Math.exp(-i / RATE / decay)
    }
    t += (0.3 + rand() * 1.4) / hitsPerSecond
  }
  return out
}

/**
 * What one mic records of `source` from `from` seconds for `seconds`: scaled, smoothed by a
 * low-pass filter and with its own hiss, so the two "mics" don't hear it identically.
 */
function record(
  source: Float32Array,
  from: number,
  seconds: number,
  {
    gain,
    smooth,
    hiss,
    seed,
  }: { gain: number; smooth: number; hiss: number; seed: number },
): Sound {
  const rand = random(seed)
  const out = new Float32Array(seconds * RATE)
  const offset = Math.round(from * RATE)
  let y = 0
  for (let i = 0; i < out.length; i++) {
    y += (1 - smooth) * ((source[offset + i] ?? 0) - y)
    out[i] = y * gain + (rand() * 2 - 1) * hiss
  }
  return sound([out, out.slice()])
}

function tone(freq: number, seconds: number): Sound {
  const out = new Float32Array(seconds * RATE)
  for (let i = 0; i < out.length; i++) {
    out[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / RATE)
  }
  return sound([out])
}

const CAMERA = { gain: 0.3, smooth: 0.8, hiss: 0.01, seed: 11 }
const RECORDER = { gain: 0.9, smooth: 0.1, hiss: 0.002, seed: 22 }

// A song for playing along to in headphones: a backing track (drums) and a player (guitar) who
// shares only its timing, not its sound. Like a real arrangement, the parts push the same accents,
// which change from bar to bar; the drums also vary in ways the player doesn't follow.
const BEAT = 0.6 // 100 bpm
const BAR = BEAT * 4

/** A song's bars, made up from `seed`: in each, the 8ths both parts accent, and whether it's a break. */
function song(seed: number, bars: number) {
  const rand = random(seed)
  return Array.from({ length: bars }, () => ({
    accents: [0, 1, 2, 3, 4, 5, 6, 7].filter((e) => e === 0 || rand() < 0.3),
    rest: rand() < 0.08,
  }))
}
type Song = ReturnType<typeof song>

/** Adds a decaying sound at `t` seconds: `wave` gives each sample from its time since the hit. */
function hit(
  out: Float32Array,
  t: number,
  seconds: number,
  wave: (since: number) => number,
) {
  const start = Math.round(t * RATE)
  for (
    let i = Math.max(0, -start);
    i < seconds * RATE && start + i < out.length;
    i++
  ) {
    out[start + i] += wave(i / RATE)
  }
}

function kick(s: number) {
  return 0.8 * Math.sin(2 * Math.PI * 55 * s) * Math.exp(-s / 0.08)
}

/** The backing track: kick on the accents, snare on 2 and 4, hats on 8ths with ghost notes. */
function backingTrack(bars: Song, seed: number): Sound {
  const rand = random(seed)
  function noise() {
    return rand() * 2 - 1
  }
  function snare(s: number) {
    return 0.5 * noise() * Math.exp(-s / 0.05)
  }
  const out = new Float32Array(Math.ceil(bars.length * BAR * RATE))
  bars.forEach(({ accents, rest }, bar) => {
    if (rest) {
      return
    }
    const t = bar * BAR
    for (const e of accents) {
      hit(out, t + (e * BEAT) / 2, 0.4, kick)
    }
    hit(out, t + BEAT, 0.3, snare)
    hit(out, t + 3 * BEAT, 0.3, snare)
    for (let e = 0; e < 16; e++) {
      // Hats on the 8ths, and 16th ghost notes here and there, at varying levels.
      if (e % 2 === 0 || rand() < 0.2) {
        const level = 0.05 + rand() * 0.15
        hit(
          out,
          t + (e * BEAT) / 4,
          0.05,
          (s) => level * noise() * Math.exp(-s / 0.01),
        )
      }
    }
  })
  return sound([out, out.slice()])
}

/**
 * The player, as the camera hears them from `from` seconds into the song: a strummed chord on
 * each accent, each a few ms off the beat, with some missed. They stop when the drums do.
 */
function playAlong(
  bars: Song,
  from: number,
  seconds: number,
  seed: number,
): Sound {
  const rand = random(seed)
  // About ±12 ms of human timing (a Box–Muller normal).
  function jitter() {
    return (
      0.012 *
      Math.sqrt(-2 * Math.log(rand() + 1e-9)) *
      Math.cos(2 * Math.PI * rand())
    )
  }
  // A G major chord, with a scratch of pick noise at the start.
  function strum(s: number) {
    return (
      0.3 *
      Math.exp(-s / 0.25) *
      (Math.sin(2 * Math.PI * 196 * s) +
        Math.sin(2 * Math.PI * 247 * s) +
        Math.sin(2 * Math.PI * 294 * s) +
        (s < 0.01 ? rand() * 2 - 1 : 0))
    )
  }
  const take = new Float32Array(Math.ceil(seconds * RATE))
  bars.forEach(({ accents, rest }, bar) => {
    for (const e of rest ? [] : accents) {
      if (rand() > 0.1) {
        hit(take, bar * BAR + (e * BEAT) / 2 - from + jitter(), 0.6, strum)
      }
    }
  })
  return record(take, 0, seconds, CAMERA)
}

describe('findSync', () => {
  it('finds the offset when the audio starts after the video', () => {
    const source = performance(25, 1)
    const video = record(source, 0, 20, CAMERA)
    const audio = record(source, 3.217, 12, RECORDER)
    const syncOffset = findSync(video, audio)
    expect(syncOffset).not.toBeNull()
    expect(Math.abs(syncOffset! - 3217)).toBeLessThanOrEqual(1)
  })

  it('finds the offset when the audio starts before the video', () => {
    const source = performance(25, 2)
    const video = record(source, 4.5, 15, CAMERA)
    const audio = record(source, 0, 15, RECORDER)
    const syncOffset = findSync(video, audio)
    expect(syncOffset).not.toBeNull()
    expect(Math.abs(syncOffset! + 4500)).toBeLessThanOrEqual(1)
  })

  it('finds the offset with a different sample rate in a 44.1 kHz file', () => {
    const source = performance(12, 3)
    const video = record(source, 1.25, 10, CAMERA)
    // Downsample the recorder's take to 44.1 kHz by picking the nearest sample.
    const take = record(source, 0, 10, RECORDER).getChannelData(0)
    const resampled = new Float32Array(Math.floor((take.length * 44100) / RATE))
    for (let i = 0; i < resampled.length; i++) {
      resampled[i] = take[Math.floor((i * RATE) / 44100)]
    }
    const syncOffset = findSync(video, sound([resampled], 44100))
    expect(syncOffset).not.toBeNull()
    expect(Math.abs(syncOffset! + 1250)).toBeLessThanOrEqual(1)
  })

  it('finds the offset of someone playing along in headphones, who shares only the timing', () => {
    // The camera starts 4 s into a 64 s song and only hears the guitar.
    const bars = song(6, 27)
    const syncOffset = findSync(
      playAlong(bars, 4, 40, 8),
      backingTrack(bars, 9),
    )
    expect(syncOffset).not.toBeNull()
    // Within the player's timing, which is only good to a few ms.
    expect(Math.abs(syncOffset! + 4000)).toBeLessThanOrEqual(20)
  })

  it('finds no match between playing along and a different song at the same tempo', () => {
    const video = playAlong(song(6, 27), 4, 40, 8)
    expect(findSync(video, backingTrack(song(7, 27), 9))).toBeNull()
  })

  it('finds no match between unrelated recordings', () => {
    const video = record(performance(15, 4), 0, 15, CAMERA)
    const audio = record(performance(15, 5), 0, 15, RECORDER)
    expect(findSync(video, audio)).toBeNull()
  })

  it('finds no match in silence', () => {
    const silence = sound([new Float32Array(5 * RATE)])
    expect(findSync(silence, silence)).toBeNull()
  })

  it('finds no match between steady tones', () => {
    expect(findSync(tone(440, 3), tone(880, 2))).toBeNull()
  })

  it('finds no match in a steady beat, which lines up at every beat', () => {
    const beat = new Float32Array(20 * RATE)
    for (let t = 0.1; t < 20; t += 0.5) {
      const start = Math.floor(t * RATE)
      for (let i = 0; i < 0.03 * RATE; i++) {
        beat[start + i] = Math.sin(i / 3) * Math.exp(-i / 400)
      }
    }
    const video = record(beat, 0, 15, CAMERA)
    const audio = record(beat, 2.2, 15, RECORDER)
    const syncOffset = findSync(video, audio)
    expect(syncOffset).toBeNull()
  })

  it('finds no match in empty sound', () => {
    const empty = sound([new Float32Array(0)])
    expect(findSync(empty, tone(440, 1))).toBeNull()
  })
})

describe('findClipsSync', () => {
  it('finds no match when a clip has no sound', () => {
    expect(findClipsSync({ video: testClip(), audio: testClip() })).toBeNull()
    expect(findClipsSync({ video: null, audio: testClip() })).toBeNull()
  })
})

describe('autoSyncFor', () => {
  it('asks for both clips until there are two', () => {
    expect(autoSyncFor({ video: testClip(), audio: null }, 500)).toEqual({
      status: 'none',
      reason: 'Import a video and an audio file to sync them',
    })
  })

  it('says it couldn’t sync when nothing matched', () => {
    expect(autoSyncFor({ video: testClip(), audio: testClip() }, null)).toEqual(
      {
        status: 'none',
        reason: 'Couldn’t sync the clips automatically',
      },
    )
  })

  it('offers the sync offset that was found', () => {
    expect(
      autoSyncFor({ video: testClip(), audio: testClip() }, -3707),
    ).toEqual({
      status: 'matched',
      syncOffset: -3707,
    })
  })
})
