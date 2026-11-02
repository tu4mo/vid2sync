/** The timeline's two tracks: the video (with its own audio) and the separate audio. */
export type TrackKind = 'video' | 'audio'

/** Every track, in the order they're shown and scheduled. */
export const TRACK_KINDS: readonly TrackKind[] = ['video', 'audio']

/** A volume for each track, as a gain (1 is 100%). */
export type Volumes = Record<TrackKind, number>

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

/** One end of a clip or range: its start or its end. */
export type Edge = keyof TimeRange

/**
 * One fade, as distances in from its clip edge in seconds: silent up to `silent`, ramping to
 * full volume at `full`.
 */
export type FadeSpan = {
  silent: number
  full: number
}

/** A clip's fade-in (`start`) and fade-out (`end`). */
export type Fade = Record<Edge, FadeSpan>

/** No fade at either end. */
export const NO_FADE: Fade = {
  start: { silent: 0, full: 0 },
  end: { silent: 0, full: 0 },
}

// The shortest a ramp can be after a silence, so a fade never turns into a hard cut.
const MIN_RAMP = 0.01

/** The shortest a clip can be trimmed to. */
export const MIN_CLIP = 0.05

/** Rounds to the millisecond, so edits don't leave float noise in the clip's times. */
export function roundMs(t: number) {
  return Math.round(t * 1000) / 1000
}

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

/** Where the last clip ends on the timeline; 0 with no clips. */
export function clipsEnd(clips: Clips): number {
  return Math.max(
    0,
    ...TRACK_KINDS.map((k) => (clips[k] ? clipSpan(clips[k]).end : 0)),
  )
}

/** Applies `edit` to the clip on the `kind` track, if there is one. */
export function updateClip(
  clips: Clips,
  kind: TrackKind,
  edit: (clip: Clip) => Clip,
): Clips {
  const clip = clips[kind]
  return clip ? { ...clips, [kind]: edit(clip) } : clips
}

/** Moves the clip to `offset`, but not so far that its trimmed part starts before 0:00. */
export function moveClip(clip: Clip, offset: number): Clip {
  return { ...clip, offset: roundMs(Math.max(minOffset(clip), offset)) }
}

/** Moves the trimmed part's start or end to timeline time `t`, within the file and 0:00. */
export function trimClip(clip: Clip, edge: Edge, t: number): Clip {
  const local = roundMs(t - clip.offset)
  const trim =
    edge === 'start'
      ? {
          ...clip.trim,
          start: Math.min(
            Math.max(0, -clip.offset, local),
            clip.trim.end - MIN_CLIP,
          ),
        }
      : {
          ...clip.trim,
          end: Math.max(
            Math.min(clip.duration, local),
            clip.trim.start + MIN_CLIP,
          ),
        }
  return { ...clip, trim }
}

/** Puts one end of the trim, or with no edge both, back at the file's edge. */
export function untrimClip(clip: Clip, edge?: Edge): Clip {
  // The start can only go back as far as 0:00.
  const edges = { start: Math.max(0, -clip.offset), end: clip.duration }
  const trim = edge ? { ...clip.trim, [edge]: edges[edge] } : edges
  return { ...clip, trim }
}

/** Sets the clip's fade-in or fade-out, leaving room for the other fade. */
export function fadeClip(clip: Clip, edge: Edge, span: FadeSpan): Clip {
  const other = edge === 'start' ? 'end' : 'start'
  const room = clip.trim.end - clip.trim.start - clipFade(clip)[other].full
  const rounded = { silent: roundMs(span.silent), full: roundMs(span.full) }
  return { ...clip, fade: { ...clip.fade, [edge]: fitFade(rounded, room) } }
}

/** New offsets for the clips, from `syncTo`. */
export type Sync = {
  /** The gap that was set, in ms. */
  delta: number
  audio: number
  /** Only there when the video has to move too. */
  video?: number
}

/**
 * Where the clips go for the audio to start `ms` after the video. Moves the audio; if that would
 * put it before 0:00, the video moves the other way instead. Clamped to where the clips still
 * overlap, which also keeps a typo from stretching the timeline to days.
 */
export function syncTo(video: Clip, audio: Clip, ms: number): Sync {
  const delta = Math.min(
    Math.max(ms, -Math.floor(audio.duration * 1000)),
    Math.floor(video.duration * 1000),
  )
  const audioMin = minOffset(audio)
  const target = video.offset + delta / 1000
  return target >= audioMin
    ? { delta, audio: target }
    : { delta, audio: audioMin, video: audioMin - delta / 1000 }
}
