/** The timeline's two tracks: the video (with its own audio) and the separate audio. */
export type TrackKind = 'video' | 'audio'

/** Every track, in the order they're shown and scheduled. */
export const TRACK_KINDS: readonly TrackKind[] = ['video', 'audio']

/** A clip's waveform, as the sample range of each short bucket of audio. */
export type Peaks = {
  /** Buckets per second of audio, for mapping a bucket to its time. */
  perSecond: number
  /** Lowest sample of each bucket, at most 0. */
  min: Float32Array
  /** Highest sample of each bucket, at least 0. */
  max: Float32Array
}

/** A loaded media file and where it sits on the timeline. */
export type Clip = {
  file: File
  /** Blob URL of the file, for the video element. */
  url: string
  /** Length in seconds. */
  duration: number
  /** Position of the file's start on the timeline, in seconds. Below 0 when trimmed. */
  offset: number
  /** The part of the file that's used, in seconds into the file. */
  trim: TimeRange
  /** How the sound fades in from the trimmed part's start and out to its end. */
  fade: Fade
  /** Decoded audio, or null when the file has no decodable audio track. */
  buffer: AudioBuffer | null
  /** Waveform of `buffer`, or null when there's no audio. */
  peaks: Peaks | null
}

/** The clip on each track, or null for an empty track. */
export type Clips = Record<TrackKind, Clip | null>

/** A span of the timeline, in seconds. */
export type TimeRange = {
  start: number
  end: number
}

/**
 * One fade, as distances in from its clip edge in seconds: silent up to `silent`, ramping to
 * full volume at `full`.
 */
export type FadeSpan = {
  silent: number
  full: number
}

/** A clip's fade-in (`start`) and fade-out (`end`). */
export type Fade = Record<keyof TimeRange, FadeSpan>

/** No fade at either end. */
export const NO_FADE: Fade = {
  start: { silent: 0, full: 0 },
  end: { silent: 0, full: 0 },
}

// The shortest a ramp can be after a silence, so a fade never turns into a hard cut.
const MIN_RAMP = 0.01

/** Fits a fade into `room` seconds, keeping the silence before its ramp. */
export function fitFade({ silent, full }: FadeSpan, room: number): FadeSpan {
  const fitted = Math.min(Math.max(0, full), room)
  return {
    silent: Math.min(Math.max(0, silent), Math.max(0, fitted - MIN_RAMP)),
    full: fitted,
  }
}

/** Where the clip's used part starts and ends on the timeline. */
export function clipSpan(clip: Clip): TimeRange {
  return {
    start: clip.offset + clip.trim.start,
    end: clip.offset + clip.trim.end,
  }
}

/**
 * The fades as they apply: trimming can leave less room than they were set to, so they're
 * cut down to fit, the fade-in first.
 */
export function clipFade(clip: Clip): Fade {
  const length = clip.trim.end - clip.trim.start
  const start = fitFade(clip.fade.start, length)
  return { start, end: fitFade(clip.fade.end, length - start.full) }
}

/** The earliest offset a clip can have: its trimmed part can't start before 0:00. */
export function minOffset(clip: Clip): number {
  return -clip.trim.start
}

const PEAKS_PER_SECOND = 200

/**
 * Reduces decoded audio to the lowest and highest sample of each ~1/200 s bucket, across
 * all channels, for drawing the waveform.
 */
function computePeaks(buffer: AudioBuffer): Peaks {
  const bucket = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SECOND))
  const count = Math.ceil(buffer.length / bucket)
  const min = new Float32Array(count)
  const max = new Float32Array(count)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  )

  for (let i = 0; i < count; i++) {
    const start = i * bucket
    const end = Math.min(buffer.length, start + bucket)
    let lo = 0
    let hi = 0
    for (const data of channels) {
      for (let s = start; s < end; s++) {
        const v = data[s]
        if (v < lo) {
          lo = v
        } else if (v > hi) {
          hi = v
        }
      }
    }
    min[i] = lo
    max[i] = hi
  }

  return { perSecond: buffer.sampleRate / bucket, min, max }
}

/** Reads the file's duration from its metadata; 0 when the browser can't tell. */
function readDuration(url: string, kind: TrackKind): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind)
    el.preload = 'metadata'
    el.addEventListener('loadedmetadata', () =>
      resolve(Number.isFinite(el.duration) ? el.duration : 0),
    )
    el.addEventListener('error', () => resolve(0))
    el.src = url
  })
}

/**
 * Loads a dropped file as a clip at the start of the timeline, decoding its audio when it
 * has any. Throws when neither the metadata nor the audio gives a duration.
 */
export async function loadClip(
  file: File,
  kind: TrackKind,
  ctx: AudioContext,
): Promise<Clip> {
  const url = URL.createObjectURL(file)
  const [metaDuration, buffer] = await Promise.all([
    readDuration(url, kind),
    file
      .arrayBuffer()
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null),
  ])

  const duration = metaDuration || buffer?.duration || 0
  if (!duration) {
    URL.revokeObjectURL(url)
    throw new Error(
      `Could not read “${file.name}”. Is it a supported ${kind} format?`,
    )
  }

  return {
    file,
    url,
    duration,
    offset: 0,
    trim: { start: 0, end: duration },
    fade: NO_FADE,
    buffer,
    peaks: buffer ? computePeaks(buffer) : null,
  }
}

const VIDEO_EXTENSIONS = ['mov', 'mp4', 'm4v', 'webm', 'mkv', 'avi', '3gp']
const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'opus',
  'aif',
  'aiff',
  'caf',
]

/** Picks the track a file belongs on, by MIME type or else extension; null if neither. */
export function kindForFile(file: File): TrackKind | null {
  if (file.type.startsWith('video/')) {
    return 'video'
  }
  if (file.type.startsWith('audio/')) {
    return 'audio'
  }
  // Files dragged from some apps (e.g. macOS Photos) can arrive without a MIME type.
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return 'video'
  }
  if (AUDIO_EXTENSIONS.includes(ext)) {
    return 'audio'
  }
  return null
}
