/**
 * General tools for working with signals: lists of numbers measured at even steps, such as
 * loudness every millisecond. Nothing here knows about video or audio files; see `autoSync.ts`
 * for how they're used.
 *
 * Several tools compare two signals with one of them shifted: `b` moved `lag` steps later than
 * `a` (a negative `lag` moves it earlier). Only the steps where both have a value count.
 */

/** `signal` with its average taken off every value, so the result averages 0. */
export function centred(signal: Float64Array): Float64Array {
  const average =
    signal.reduce((sum, value) => sum + value, 0) / Math.max(1, signal.length)
  return signal.map((value) => value - average)
}

/**
 * `signal` blurred, so a peak spreads out over its neighbours. Each value becomes a weighted
 * average of those around it, the weights following a bell curve `width` steps wide (its sigma).
 */
export function blur(signal: Float64Array, width: number): Float64Array {
  const radius = Math.ceil(width * 3)
  const weights = Float64Array.from({ length: radius * 2 + 1 }, (_, k) =>
    Math.exp(-((k - radius) ** 2) / (2 * width * width)),
  )
  return signal.map((_, i) => {
    let sum = 0
    let totalWeight = 0
    for (let k = -radius; k <= radius; k++) {
      const j = i + k
      if (j >= 0 && j < signal.length) {
        sum += signal[j] * weights[k + radius]
        totalWeight += weights[k + radius]
      }
    }
    return sum / totalWeight
  })
}

/**
 * `signal` faded in from 0 and back out to 0 over `steps` at each end (or a quarter of it, when
 * shorter), along a smooth S-curve.
 */
export function fadeEdges(signal: Float64Array, steps: number): Float64Array {
  const length = Math.min(Math.round(steps), Math.floor(signal.length / 4))
  return signal.map((value, i) => {
    const fromEdge = Math.min(i, signal.length - 1 - i)
    return fromEdge < length
      ? value * (0.5 - 0.5 * Math.cos((Math.PI * fromEdge) / length))
      : value
  })
}

/**
 * In-place radix-2 FFT of a signal whose length is a power of 2. `inverse` skips the 1/n scale,
 * which only changes the size of every value, not which is largest.
 */
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
 * How well `a` and `b` match at every possible `lag`, all at once: the sum of `a` times the
 * shifted `b`, for every lag from `-(b.length - 1)` to `a.length - 1`, stored at index
 * `lag + b.length - 1`. Uses the FFT, so it's fast even for long signals.
 *
 * `whitening` (0–1) evens out how much each frequency counts first: 0 is the plain sum, 1 is
 * GCC-PHAT, where every frequency counts the same.
 */
export function crossCorrelate(
  a: Float64Array,
  b: Float64Array,
  whitening: number,
): Float64Array {
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
    const scale = (re * re + im * im) ** (whitening / 2) || 1
    aRe[i] = re / scale
    aIm[i] = im / scale
  }
  fft(aRe, aIm, true)
  return Float64Array.from(
    { length: a.length + b.length - 1 },
    (_, i) => aRe[(i - (b.length - 1) + n) % n],
  )
}

/** How many steps `a` and `b` share at `lag`. */
export function overlap(a: Float64Array, b: Float64Array, lag: number) {
  return Math.min(a.length, lag + b.length) - Math.max(0, lag)
}

/** The sum of `a` times `b`, over the steps they share at `lag`. */
export function dotProduct(a: Float64Array, b: Float64Array, lag: number) {
  let sum = 0
  for (let i = Math.max(0, lag); i < Math.min(a.length, lag + b.length); i++) {
    sum += a[i] * b[i - lag]
  }
  return sum
}

/**
 * How closely `a` and `b` rise and fall together over the steps they share at `lag`: their
 * Pearson correlation, from 1 (in step) through 0 (unrelated) to -1 (opposite). 0 when either
 * is flat there.
 */
export function correlation(a: Float64Array, b: Float64Array, lag: number) {
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
