import { syncClips, syncOffsetOf, type Clips } from './clip'

/** The parts of a decoded file's AudioBuffer that matching reads, so tests can fake one. */
export type Sound = Pick<
  AudioBuffer,
  'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'
>

// The first pass compares the whole files at 10 ms steps; the second refines around its best
// match at 1 ms steps.
const COARSE_HOP_MS = 10
const COARSE_WINDOW_MS = 20
const FINE_HOP_MS = 1
const FINE_WINDOW_MS = 5
/** How far either side of the first pass's match the second pass looks. */
const FINE_SEARCH_MS = 15
/**
 * The first pass blurs the rises by this much (a Gaussian's sigma), so someone playing along by
 * ear, a few ms off each beat, still lines up.
 */
const SMOOTH_MS = 20
/**
 * How far the first pass evens out the cross-spectrum (0 is plain correlation, 1 is full
 * GCC-PHAT). A steady beat piles into a few frequencies; evening them out lets the parts that
 * don't repeat, such as breaks, fills and where the playing stops, decide the match. Full
 * evening out amplifies what the blur removed, so it stops short of 1.
 */
const WHITENING = 0.7
/** Rises closer than this to the best match count as the same match, not a rival. */
const RIVAL_GAP_MS = 60
/** The clips must overlap this much at a match for it to count. */
const MIN_OVERLAP_MS = 1000
/**
 * The first pass fades the rises in and out over this long at each end of a file (or a quarter
 * of it, when shorter). A recording starts and stops abruptly, and evening out the
 * cross-spectrum would otherwise make those edges line up, as if they were shared sounds.
 */
const TAPER_MS = 3000
/** The best match must beat the runner-up by this factor, so a steady beat doesn't pass. */
const MIN_PEAK_RATIO = 1.5
/** How closely the clips' rises in loudness must agree at the match (a correlation, 0–1). */
const MIN_AGREEMENT = 0.2
/** A rise from silence counts from this level, relative to the file's average, so hiss doesn't. */
const FLOOR = 1e-3
/** A step this much louder than the one before (double the energy) counts as a clear rise. */
const CLEAR_RISE = Math.log(2)
/** Each file needs this many clear rises to match on; a steady tone or hum has none. */
const MIN_RISES = 3

/** The sum of the squares of `data` from `start` up to `end`. */
function sumOfSquares(data: Float32Array, start: number, end: number) {
  let sum = 0
  for (let sample = start; sample < end; sample++) {
    sum += data[sample] * data[sample]
  }
  return sum
}

/** The mean square of each millisecond of sound, averaged across channels. */
function energyPerMs(sound: Sound): Float64Array {
  const { sampleRate, length, numberOfChannels } = sound
  const channels = Array.from({ length: numberOfChannels }, (_, channel) =>
    sound.getChannelData(channel),
  )
  return Float64Array.from(
    { length: Math.floor((length * 1000) / sampleRate) },
    (_, i) => {
      // Rounded rather than a fixed hop, so rates like 44.1 kHz don't drift.
      const start = Math.floor((i * sampleRate) / 1000)
      const end = Math.floor(((i + 1) * sampleRate) / 1000)
      return channels.reduce(
        (total, data) =>
          total +
          sumOfSquares(data, start, end) / ((end - start) * numberOfChannels),
        0,
      )
    },
  )
}

/**
 * How sharply the sound gets louder at each step: the log of a window's energy over the window
 * before it, or 0 when it gets quieter. Being a ratio, it doesn't care how loud each mic was.
 * Centred on its mean, so stretches with no rises don't add to the correlation; `rises` counts
 * the clear ones.
 */
function onsets(energy: Float64Array, hopMs: number, windowMs: number) {
  // A running sum is sequential, so it's filled in place.
  const prefix = new Float64Array(energy.length + 1)
  for (let i = 0; i < energy.length; i++) {
    prefix[i + 1] = prefix[i] + energy[i]
  }
  const floor = (prefix[energy.length] / Math.max(1, energy.length)) * FLOOR
  const count = Math.max(0, Math.floor((energy.length - windowMs) / hopMs) + 1)
  const rises = Float64Array.from({ length: count }, (_, step) => {
    // The first window has nothing before it, so it can't rise.
    if (step === 0) {
      return 0
    }
    const at = step * hopMs
    const before = prefix[at] - prefix[Math.max(0, at - windowMs)]
    const now = prefix[at + windowMs] - prefix[at]
    return Math.max(0, Math.log((now + floor) / (before + floor)))
  })
  const mean = rises.reduce((sum, rise) => sum + rise, 0) / Math.max(1, count)
  return {
    values: rises.map((rise) => rise - mean),
    rises: rises.filter((rise) => rise >= CLEAR_RISE).length,
  }
}

/** Blurs `signal` with a Gaussian of `sigma` steps. */
function blur(signal: Float64Array, sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 3)
  const kernel = Float64Array.from({ length: radius * 2 + 1 }, (_, k) =>
    Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)),
  )
  return signal.map((_, i) => {
    let sum = 0
    let weight = 0
    for (let k = -radius; k <= radius; k++) {
      const j = i + k
      if (j >= 0 && j < signal.length) {
        sum += signal[j] * kernel[k + radius]
        weight += kernel[k + radius]
      }
    }
    return sum / weight
  })
}

/** Fades `signal` in and out with a raised cosine over `TAPER_MS` at each end. */
function taper(signal: Float64Array): Float64Array {
  const length = Math.min(
    Math.round(TAPER_MS / COARSE_HOP_MS),
    Math.floor(signal.length / 4),
  )
  return signal.map((value, i) => {
    const fromEdge = Math.min(i, signal.length - 1 - i)
    return fromEdge < length
      ? value * (0.5 - 0.5 * Math.cos((Math.PI * fromEdge) / length))
      : value
  })
}

/** In-place radix-2 FFT; `inverse` skips the 1/n scale, which the peak search doesn't need. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) {
      j ^= bit
    }
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    const half = size >> 1
    for (let start = 0; start < n; start += size) {
      let uRe = 1
      let uIm = 0
      for (let k = 0; k < half; k++) {
        const a = start + k
        const b = a + half
        const tRe = re[b] * uRe - im[b] * uIm
        const tIm = re[b] * uIm + im[b] * uRe
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const next = uRe * wRe - uIm * wIm
        uIm = uRe * wIm + uIm * wRe
        uRe = next
      }
    }
  }
}

/**
 * `out[lag]` is how well `a` matches `b` shifted `lag` steps later, for every lag from
 * `-(b.length - 1)` to `a.length - 1`, stored at `lag + b.length - 1`. Each frequency's
 * magnitude is raised to `1 - WHITENING` first.
 */
function crossCorrelate(a: Float64Array, b: Float64Array): Float64Array {
  const n = 2 ** Math.ceil(Math.log2(a.length + b.length))
  // The FFT works in place, on buffers only this function sees.
  const aRe = new Float64Array(n)
  const aIm = new Float64Array(n)
  const bRe = new Float64Array(n)
  const bIm = new Float64Array(n)
  aRe.set(a)
  bRe.set(b)
  fft(aRe, aIm, false)
  fft(bRe, bIm, false)
  // Multiply a by b's complex conjugate, then even out the magnitudes.
  for (let i = 0; i < n; i++) {
    const re = aRe[i] * bRe[i] + aIm[i] * bIm[i]
    const im = aIm[i] * bRe[i] - aRe[i] * bIm[i]
    const scale = (re * re + im * im) ** (WHITENING / 2) || 1
    aRe[i] = re / scale
    aIm[i] = im / scale
  }
  fft(aRe, aIm, true)
  return Float64Array.from(
    { length: a.length + b.length - 1 },
    (_, i) => aRe[(i - (b.length - 1) + n) % n],
  )
}

/** How many steps `a` and `b` share when `b` is shifted `lag` steps later. */
function overlap(a: Float64Array, b: Float64Array, lag: number) {
  return Math.min(a.length, lag + b.length) - Math.max(0, lag)
}

/** The sum of `a` times `b` over the part they share at `lag`. */
function dot(a: Float64Array, b: Float64Array, lag: number) {
  let sum = 0
  for (let i = Math.max(0, lag); i < Math.min(a.length, lag + b.length); i++) {
    sum += a[i] * b[i - lag]
  }
  return sum
}

/** The Pearson correlation of `a` and `b` over the part they share at `lag`. */
function agreement(a: Float64Array, b: Float64Array, lag: number) {
  const start = Math.max(0, lag)
  const end = Math.min(a.length, lag + b.length)
  let sumA = 0
  let sumB = 0
  for (let i = start; i < end; i++) {
    sumA += a[i]
    sumB += b[i - lag]
  }
  const meanA = sumA / (end - start)
  const meanB = sumB / (end - start)
  let covariance = 0
  let varianceA = 0
  let varianceB = 0
  for (let i = start; i < end; i++) {
    const deviationA = a[i] - meanA
    const deviationB = b[i - lag] - meanB
    covariance += deviationA * deviationB
    varianceA += deviationA * deviationA
    varianceB += deviationB * deviationB
  }
  return varianceA > 0 && varianceB > 0
    ? covariance / Math.sqrt(varianceA * varianceB)
    : 0
}

/**
 * The index below `count` with the highest score (the first, on a tie) and that score. The index
 * is -1, and the score -Infinity, when no score beats -Infinity.
 */
function highest(count: number, scoreAt: (i: number) => number) {
  let index = -1
  let score = -Infinity
  for (let i = 0; i < count; i++) {
    const candidate = scoreAt(i)
    if (candidate > score) {
      index = i
      score = candidate
    }
  }
  return { index, score }
}

/**
 * Finds where the audio file lines up with the video's own sound, by matching where each gets
 * suddenly louder (claps, hits, consonants). The sounds needn't be the same: someone playing
 * along to the track in headphones shares only its timing, and that's enough when the music
 * doesn't just repeat. Compares the whole files, ignoring trims. Returns the sync offset in ms
 * (see `syncOffsetOf`), or null unless one match clearly beats every other.
 */
export function findSync(video: Sound, audio: Sound): number | null {
  const videoEnergy = energyPerMs(video)
  const audioEnergy = energyPerMs(audio)

  // First pass: every possible offset, at 10 ms steps.
  const coarseVideo = onsets(videoEnergy, COARSE_HOP_MS, COARSE_WINDOW_MS)
  const coarseAudio = onsets(audioEnergy, COARSE_HOP_MS, COARSE_WINDOW_MS)
  if (coarseVideo.rises < MIN_RISES || coarseAudio.rises < MIN_RISES) {
    return null
  }
  const videoOnsets = taper(blur(coarseVideo.values, SMOOTH_MS / COARSE_HOP_MS))
  const audioOnsets = taper(blur(coarseAudio.values, SMOOTH_MS / COARSE_HOP_MS))
  const scores = crossCorrelate(videoOnsets, audioOnsets)
  const minOverlap = Math.min(
    MIN_OVERLAP_MS / COARSE_HOP_MS,
    videoOnsets.length,
    audioOnsets.length,
  )
  // Score i is for the audio file starting i - shift steps after the video.
  const shift = audioOnsets.length - 1
  // A match where the clips barely overlap doesn't count, as the best or as a rival.
  function scoreAt(i: number) {
    return overlap(videoOnsets, audioOnsets, i - shift) < minOverlap
      ? -Infinity
      : scores[i]
  }
  const best = highest(scores.length, scoreAt)
  if (best.index < 0 || best.score <= 0) {
    return null
  }
  const gap = RIVAL_GAP_MS / COARSE_HOP_MS
  const rival = highest(scores.length, (i) =>
    Math.abs(i - best.index) > gap ? scoreAt(i) : -Infinity,
  )
  const coarseLag = best.index - shift
  if (
    best.score < Math.max(0, rival.score) * MIN_PEAK_RATIO ||
    agreement(videoOnsets, audioOnsets, coarseLag) < MIN_AGREEMENT
  ) {
    return null
  }

  // Second pass: 1 ms steps, around the first pass's match.
  const fineVideo = onsets(videoEnergy, FINE_HOP_MS, FINE_WINDOW_MS).values
  const fineAudio = onsets(audioEnergy, FINE_HOP_MS, FINE_WINDOW_MS).values
  const firstLag = coarseLag * COARSE_HOP_MS - FINE_SEARCH_MS
  const fine = highest(FINE_SEARCH_MS * 2 + 1, (step) =>
    dot(fineVideo, fineAudio, firstLag + step),
  )
  return firstLag + fine.index
}

/** Matches the clips by their sound (see `findSync`); null when either has none, or nothing matched. */
export function findClipsSync({ video, audio }: Clips): number | null {
  if (!video?.buffer || !audio?.buffer) {
    return null
  }
  return findSync(video.buffer, audio.buffer)
}

/** What the auto-sync button offers: the sync offset it found, or why there's none. */
export type AutoSync =
  | { status: 'matched'; syncOffset: number }
  | { status: 'none'; reason: string }

/** The auto-sync button's state, from the clips and the sync offset found when they were imported. */
export function autoSyncFor(clips: Clips, syncOffset: number | null): AutoSync {
  const { video, audio } = clips
  if (!video || !audio) {
    return {
      status: 'none',
      reason: 'Import a video and an audio file to sync them',
    }
  }
  if (syncOffset === null) {
    return { status: 'none', reason: 'Couldn’t sync the clips automatically' }
  }
  // Compared after syncing, so a match the clamp can't reach doesn't stay offered forever.
  if (syncOffsetOf(syncClips(clips, syncOffset)) === syncOffsetOf(clips)) {
    return { status: 'none', reason: 'The clips are already synced' }
  }
  return { status: 'matched', syncOffset }
}
