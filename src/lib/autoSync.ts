/**
 * Auto-sync: works out how far apart the video's own sound and a separately recorded audio file
 * are, so they can be lined up.
 *
 * The idea: both files catch the moments the sound suddenly gets louder, such as a clap, a drum
 * hit or the start of a word. Those moments happen at the same times in both, even when the mics
 * sound nothing alike, or when someone played along to the track in headphones and the video only
 * hears them. So we:
 *
 * 1. measure how loud each file is, millisecond by millisecond,
 * 2. mark where each one suddenly gets louder (its "jumps"),
 * 3. slide one file's jumps along the other's and score how well they line up at every offset,
 * 4. keep the best offset only if it clearly beats all the others,
 * 5. then look again around it, more precisely.
 *
 * The general maths (blurring, scoring every offset at once) is in `signal.ts`.
 */
import { syncClips, syncOffsetOf, type Clips } from './clip'
import {
  blur,
  centred,
  correlation,
  crossCorrelate,
  dotProduct,
  fadeEdges,
  overlap,
} from './signal'

/** The parts of a decoded file's AudioBuffer that matching reads, so tests can fake one. */
type Sound = Pick<
  AudioBuffer,
  'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'
>

// Finding jumps

/**
 * How finely each pass looks. A jump compares a window `windowMs` long with the window just
 * before it, once every `stepMs`. The rough pass tries every offset between the files, so it
 * takes big steps to stay fast; the precise pass only checks around the rough pass's answer.
 */
const ROUGH = { stepMs: 10, windowMs: 20 }
const PRECISE = { stepMs: 1, windowMs: 5 }
type Pass = typeof ROUGH

/**
 * Sound quieter than this share of the file's average loudness counts as silence, so hiss
 * getting slightly louder isn't a jump.
 */
const SILENCE = 1e-3
/** Getting this many times louder from one window to the next is a clear jump. */
const CLEAR_JUMP = 2
/** Each file needs this many clear jumps to match on; a steady tone or hum has none. */
const MIN_CLEAR_JUMPS = 3

// Scoring offsets

/** Jumps are blurred by this much, so someone playing along by ear, a few ms off, still lines up. */
const BLUR_MS = 20
/** Jumps fade in and out over this long at each end of a file (see `roughPattern`). */
const FADE_EDGES_MS = 3000
/**
 * How much the scoring plays down what repeats (0 not at all, 1 fully). A steady beat lines up
 * well at every bar; playing it down lets what doesn't repeat, such as breaks, fills and where the
 * playing stops, decide. Fully would also amplify the jitter the blur smoothed out, so it stops
 * short of 1.
 */
const WHITENING = 0.7
/** The files must overlap at least this long at an offset for it to count (or all of the shorter one). */
const MIN_OVERLAP_MS = 1000

// Choosing a winner

/** The best offset must score this many times higher than any rival. */
const WINNER_MARGIN = 1.5
/** Offsets this close to the best are the same match, slightly off, not rivals. */
const RIVAL_GAP_MS = 60
/** At the winning offset, the jumps must rise and fall together at least this much (0–1). */
const MIN_AGREEMENT = 0.2
/** How far either side of the rough answer the precise pass looks. */
const PRECISE_SEARCH_MS = 15

/** An offset to try, in ms the audio file starts after the video, and how well it lines up. */
type Candidate = { offsetMs: number; score: number }

/** How loud `sound` is during each millisecond: the average of its squared samples, over all channels. */
function loudnessPerMs(sound: Sound): Float64Array {
  const { sampleRate, numberOfChannels } = sound
  const channels = Array.from({ length: numberOfChannels }, (_, channel) =>
    sound.getChannelData(channel),
  )
  const durationMs = Math.floor((sound.length * 1000) / sampleRate)
  return Float64Array.from({ length: durationMs }, (_, ms) => {
    // Worked out for each ms rather than stepping a fixed count, so rates like 44.1 kHz don't drift.
    const start = Math.floor((ms * sampleRate) / 1000)
    const end = Math.floor(((ms + 1) * sampleRate) / 1000)
    let sum = 0
    for (const samples of channels) {
      for (let i = start; i < end; i++) {
        sum += samples[i] * samples[i]
      }
    }
    return sum / ((end - start) * numberOfChannels)
  })
}

/**
 * How suddenly `loudness` gets louder, once every `stepMs`: how many times louder each window is
 * than the one just before it, on a log scale, so 0 is no louder (getting quieter counts as 0
 * too). Being a ratio, it doesn't matter how loud each mic was.
 */
function loudnessJumps(
  loudness: Float64Array,
  { stepMs, windowMs }: Pass,
): Float64Array {
  // A running total, so any window's loudness is one subtraction rather than a loop.
  const runningTotal = new Float64Array(loudness.length + 1)
  for (let ms = 0; ms < loudness.length; ms++) {
    runningTotal[ms + 1] = runningTotal[ms] + loudness[ms]
  }
  function windowLoudness(startMs: number, endMs: number) {
    return runningTotal[endMs] - runningTotal[Math.max(0, startMs)]
  }
  const silence =
    (runningTotal[loudness.length] / Math.max(1, loudness.length)) * SILENCE
  const count = Math.max(
    0,
    Math.floor((loudness.length - windowMs) / stepMs) + 1,
  )
  return Float64Array.from({ length: count }, (_, step) => {
    // The first window has nothing before it, so it can't be a jump.
    if (step === 0) {
      return 0
    }
    const at = step * stepMs
    const before = windowLoudness(at - windowMs, at)
    const now = windowLoudness(at, at + windowMs)
    return Math.max(0, Math.log((now + silence) / (before + silence)))
  })
}

function hasEnoughJumps(jumps: Float64Array) {
  const clear = jumps.filter((jump) => jump >= Math.log(CLEAR_JUMP))
  return clear.length >= MIN_CLEAR_JUMPS
}

/**
 * The rough pass's jumps, ready for scoring offsets:
 * - centred on 0, so stretches with no jumps don't add to any score,
 * - blurred, so jumps a few ms apart still overlap,
 * - faded out at both ends. A recording starts and stops abruptly, and with the whitening, those
 *   edges would otherwise line up between the files as if they were shared sounds.
 */
function roughPattern(jumps: Float64Array): Float64Array {
  return fadeEdges(
    blur(centred(jumps), BLUR_MS / ROUGH.stepMs),
    FADE_EDGES_MS / ROUGH.stepMs,
  )
}

/** How well the patterns line up at every offset where the files overlap enough. Higher is better. */
function scoreEveryOffset(
  video: Float64Array,
  audio: Float64Array,
): Candidate[] {
  const scores = crossCorrelate(video, audio, WHITENING)
  const minOverlap = Math.min(
    MIN_OVERLAP_MS / ROUGH.stepMs,
    video.length,
    audio.length,
  )
  return Array.from(scores).flatMap((score, i) => {
    // `crossCorrelate` keeps the score for an offset of `lag` steps at `lag + audio.length - 1`.
    const lag = i - (audio.length - 1)
    return overlap(video, audio, lag) < minOverlap
      ? []
      : [{ offsetMs: lag * ROUGH.stepMs, score }]
  })
}

/** The best-scoring candidate (the earliest, on a tie), or undefined when there are none. */
function bestOf(candidates: Candidate[]) {
  return candidates.reduce<Candidate | undefined>(
    (best, candidate) =>
      !best || candidate.score > best.score ? candidate : best,
    undefined,
  )
}

/**
 * The best offset, or null unless it clearly wins: it must score above 0, and well above the best
 * offset further away. Music with a steady beat lines up about as well at every bar, so it
 * doesn't pass.
 */
function clearWinner(candidates: Candidate[]): number | null {
  const best = bestOf(candidates)
  if (!best || best.score <= 0) {
    return null
  }
  const rival = bestOf(
    candidates.filter(
      ({ offsetMs }) => Math.abs(offsetMs - best.offsetMs) > RIVAL_GAP_MS,
    ),
  )
  const rivalScore = Math.max(0, rival?.score ?? 0)
  return best.score >= rivalScore * WINNER_MARGIN ? best.offsetMs : null
}

/**
 * Whether the patterns rise and fall together at `offsetMs`. A score is a sum, so a few huge
 * jumps could win on their own; this checks the rest agrees too.
 */
function jumpsAgree(
  video: Float64Array,
  audio: Float64Array,
  offsetMs: number,
) {
  return correlation(video, audio, offsetMs / ROUGH.stepMs) >= MIN_AGREEMENT
}

/** The offset within `PRECISE_SEARCH_MS` of `roughOffsetMs` where the jumps line up best, to the ms. */
function refine(
  videoLoudness: Float64Array,
  audioLoudness: Float64Array,
  roughOffsetMs: number,
): number {
  const video = centred(loudnessJumps(videoLoudness, PRECISE))
  const audio = centred(loudnessJumps(audioLoudness, PRECISE))
  // With 1 ms steps, an offset in ms is also one in steps.
  const candidates = Array.from(
    { length: PRECISE_SEARCH_MS * 2 + 1 },
    (_, i) => {
      const offsetMs = roughOffsetMs - PRECISE_SEARCH_MS + i
      return { offsetMs, score: dotProduct(video, audio, offsetMs) }
    },
  )
  return bestOf(candidates)?.offsetMs ?? roughOffsetMs
}

/**
 * Finds the sync offset in ms (see `syncOffsetOf`) that lines the audio file up with the video's
 * own sound, or null unless one offset clearly wins. Compares the whole files, ignoring trims.
 */
function findSync(video: Sound, audio: Sound): number | null {
  // 1. How loud each file is, millisecond by millisecond.
  const videoLoudness = loudnessPerMs(video)
  const audioLoudness = loudnessPerMs(audio)

  // 2. Where each suddenly gets louder.
  const videoJumps = loudnessJumps(videoLoudness, ROUGH)
  const audioJumps = loudnessJumps(audioLoudness, ROUGH)
  if (!hasEnoughJumps(videoJumps) || !hasEnoughJumps(audioJumps)) {
    return null
  }

  // 3. How well the jumps line up at every offset.
  const videoPattern = roughPattern(videoJumps)
  const audioPattern = roughPattern(audioJumps)
  const candidates = scoreEveryOffset(videoPattern, audioPattern)

  // 4. The best offset, if it clearly wins.
  const best = clearWinner(candidates)
  if (best === null || !jumpsAgree(videoPattern, audioPattern, best)) {
    return null
  }

  // 5. The rough pass works in 10 ms steps; look again, to the ms, around its answer.
  return refine(videoLoudness, audioLoudness, best)
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
