import type { Clips } from './clip'

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

/** The mean square of each millisecond of sound, averaged across channels. */
function energyPerMs(sound: Sound): Float64Array {
  const { sampleRate, length, numberOfChannels } = sound
  const count = Math.floor((length * 1000) / sampleRate)
  const energy = new Float64Array(count)
  for (let c = 0; c < numberOfChannels; c++) {
    const data = sound.getChannelData(c)
    for (let i = 0; i < count; i++) {
      // Rounded rather than a fixed hop, so rates like 44.1 kHz don't drift.
      const start = Math.floor((i * sampleRate) / 1000)
      const end = Math.floor(((i + 1) * sampleRate) / 1000)
      let sum = 0
      for (let s = start; s < end; s++) {
        sum += data[s] * data[s]
      }
      energy[i] += sum / ((end - start) * numberOfChannels)
    }
  }
  return energy
}

/**
 * How sharply the sound gets louder at each step: the log of a window's energy over the window
 * before it, or 0 when it gets quieter. Being a ratio, it doesn't care how loud each mic was.
 * Centred on its mean, so stretches with no rises don't add to the correlation; `rises` counts
 * the clear ones.
 */
function onsets(energy: Float64Array, hopMs: number, windowMs: number) {
  const prefix = new Float64Array(energy.length + 1)
  for (let i = 0; i < energy.length; i++) {
    prefix[i + 1] = prefix[i] + energy[i]
  }
  const floor = (prefix[energy.length] / Math.max(1, energy.length)) * FLOOR
  const count = Math.max(0, Math.floor((energy.length - windowMs) / hopMs) + 1)
  const out = new Float64Array(count)
  let mean = 0
  let rises = 0
  // The first window has nothing before it, so it can't rise.
  for (let j = 1; j < count; j++) {
    const at = j * hopMs
    const before = prefix[at] - prefix[Math.max(0, at - windowMs)]
    const now = prefix[at + windowMs] - prefix[at]
    out[j] = Math.max(0, Math.log((now + floor) / (before + floor)))
    mean += out[j]
    if (out[j] >= CLEAR_RISE) {
      rises++
    }
  }
  mean /= Math.max(1, count)
  for (let j = 0; j < count; j++) {
    out[j] -= mean
  }
  return { values: out, rises }
}

/** Blurs `x` with a Gaussian of `sigma` steps. */
function blur(x: Float64Array, sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 3)
  const kernel = Float64Array.from({ length: radius * 2 + 1 }, (_, k) =>
    Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)),
  )
  const out = new Float64Array(x.length)
  for (let i = 0; i < x.length; i++) {
    let sum = 0
    let weight = 0
    for (let k = -radius; k <= radius; k++) {
      const j = i + k
      if (j >= 0 && j < x.length) {
        sum += x[j] * kernel[k + radius]
        weight += kernel[k + radius]
      }
    }
    out[i] = sum / weight
  }
  return out
}

/** Fades `x` in and out with a raised cosine over `TAPER_MS` at each end, in place. */
function taper(x: Float64Array): Float64Array {
  const length = Math.min(
    Math.round(TAPER_MS / COARSE_HOP_MS),
    Math.floor(x.length / 4),
  )
  for (let i = 0; i < length; i++) {
    const gain = 0.5 - 0.5 * Math.cos((Math.PI * i) / length)
    x[i] *= gain
    x[x.length - 1 - i] *= gain
  }
  return x
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
  let n = 1
  while (n < a.length + b.length) {
    n <<= 1
  }
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
  const out = new Float64Array(a.length + b.length - 1)
  for (let lag = -(b.length - 1); lag < a.length; lag++) {
    out[lag + b.length - 1] = aRe[(lag + n) % n]
  }
  return out
}

/** How many steps `a` and `b` share when `b` is shifted `lag` steps later. */
function overlap(a: Float64Array, b: Float64Array, lag: number) {
  return Math.min(a.length, lag + b.length) - Math.max(0, lag)
}

/** The Pearson correlation of `a` and `b` over the part they share at `lag`. */
function agreement(a: Float64Array, b: Float64Array, lag: number) {
  const start = Math.max(0, lag)
  const end = Math.min(a.length, lag + b.length)
  let sa = 0
  let sb = 0
  for (let i = start; i < end; i++) {
    sa += a[i]
    sb += b[i - lag]
  }
  const ma = sa / (end - start)
  const mb = sb / (end - start)
  let ab = 0
  let aa = 0
  let bb = 0
  for (let i = start; i < end; i++) {
    const x = a[i] - ma
    const y = b[i - lag] - mb
    ab += x * y
    aa += x * x
    bb += y * y
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0
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
  const a = taper(blur(coarseVideo.values, SMOOTH_MS / COARSE_HOP_MS))
  const b = taper(blur(coarseAudio.values, SMOOTH_MS / COARSE_HOP_MS))
  const scores = crossCorrelate(a, b)
  const minOverlap = Math.min(
    MIN_OVERLAP_MS / COARSE_HOP_MS,
    a.length,
    b.length,
  )
  // Score i is for the audio file starting i - shift steps after the video.
  const shift = b.length - 1
  let best = -1
  for (let i = 0; i < scores.length; i++) {
    if (overlap(a, b, i - shift) < minOverlap) {
      scores[i] = -Infinity
    } else if (best < 0 || scores[i] > scores[best]) {
      best = i
    }
  }
  if (best < 0 || scores[best] <= 0) {
    return null
  }
  const gap = RIVAL_GAP_MS / COARSE_HOP_MS
  let rival = 0
  for (let i = 0; i < scores.length; i++) {
    if (Math.abs(i - best) > gap && scores[i] > rival) {
      rival = scores[i]
    }
  }
  const coarseLag = best - shift
  if (
    scores[best] < rival * MIN_PEAK_RATIO ||
    agreement(a, b, coarseLag) < MIN_AGREEMENT
  ) {
    return null
  }

  // Second pass: 1 ms steps, around the first pass's match.
  const fa = onsets(videoEnergy, FINE_HOP_MS, FINE_WINDOW_MS).values
  const fb = onsets(audioEnergy, FINE_HOP_MS, FINE_WINDOW_MS).values
  const centre = coarseLag * COARSE_HOP_MS
  let fineLag = centre
  let fineBest = -Infinity
  for (
    let lag = centre - FINE_SEARCH_MS;
    lag <= centre + FINE_SEARCH_MS;
    lag++
  ) {
    const start = Math.max(0, lag)
    const end = Math.min(fa.length, lag + fb.length)
    let sum = 0
    for (let i = start; i < end; i++) {
      sum += fa[i] * fb[i - lag]
    }
    if (sum > fineBest) {
      fineBest = sum
      fineLag = lag
    }
  }
  return fineLag
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
export function autoSyncFor(
  { video, audio }: Clips,
  syncOffset: number | null,
): AutoSync {
  if (!video || !audio) {
    return {
      status: 'none',
      reason: 'Import a video and an audio file to sync them',
    }
  }
  if (syncOffset === null) {
    return { status: 'none', reason: 'Couldn’t sync the clips automatically' }
  }
  return { status: 'matched', syncOffset }
}
