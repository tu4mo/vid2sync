/** The timeline's two tracks: the video (with its own audio) and the separate audio. */
export type TrackKind = 'video' | 'audio'

/** Every track, in the order they're shown and scheduled. */
export const TRACK_KINDS: readonly TrackKind[] = ['video', 'audio']

/** A volume for each track, as a gain (1 is 100%). */
export type Volumes = Record<TrackKind, number>

/** The loudest a track can be turned up to, as a gain. */
export const MAX_VOLUME = 2

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

/** A change to a clip, such as `(clip) => moveClip(clip, 2)`. */
export type ClipEdit = (clip: Clip) => Clip

/** The shortest a ramp can be after a silence, so a fade never turns into a hard cut. */
const MIN_RAMP = 0.01

/** The shortest a clip can be trimmed to. */
const MIN_CLIP = 0.05

/** Rounds to the millisecond, so edits don't leave float noise in the clip's times. */
export function roundMs(seconds: number) {
  return Math.round(seconds * 1000) / 1000
}

/** Whether a fade does anything: a span that ramps to full at 0 is no fade. */
export function hasFade(span: FadeSpan): boolean {
  return span.full > 0
}

/** Fits a fade into `room` seconds, keeping the silence before its ramp. */
function fitFade({ silent, full }: FadeSpan, room: number): FadeSpan {
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
function minOffset(clip: Clip): number {
  return -clip.trim.start
}

/** The earliest the trim can start, in seconds into the file: the file's start, or 0:00. */
function minTrimStart(clip: Clip): number {
  return Math.max(0, -clip.offset)
}

/** Where the last clip ends on the timeline; 0 with no clips. */
export function clipsEnd(clips: Clips): number {
  return Math.max(
    0,
    ...TRACK_KINDS.map((kind) => (clips[kind] ? clipSpan(clips[kind]).end : 0)),
  )
}

/** Applies `edit` to the clip on the `kind` track, if there is one. */
export function updateClip(
  clips: Clips,
  kind: TrackKind,
  edit: ClipEdit,
): Clips {
  const clip = clips[kind]
  return clip ? { ...clips, [kind]: edit(clip) } : clips
}

/** Moves the clip to `offset`, but not so far that its trimmed part starts before 0:00. */
export function moveClip(clip: Clip, offset: number): Clip {
  return { ...clip, offset: roundMs(Math.max(minOffset(clip), offset)) }
}

/** Moves the trimmed part's start or end to `time` on the timeline, within the file and 0:00. */
export function trimClip(clip: Clip, edge: Edge, time: number): Clip {
  const clipTime = roundMs(time - clip.offset)
  const { start, end } = clip.trim
  const trim =
    edge === 'start'
      ? {
          start: Math.min(
            Math.max(minTrimStart(clip), clipTime),
            end - MIN_CLIP,
          ),
          end,
        }
      : {
          start,
          end: Math.max(Math.min(clip.duration, clipTime), start + MIN_CLIP),
        }
  return { ...clip, trim }
}

/** Puts one end of the trim, or with no edge both, back at the file's edge. */
export function untrimClip(clip: Clip, edge?: Edge): Clip {
  const edges = { start: minTrimStart(clip), end: clip.duration }
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

/**
 * The clips' sync offset: how far apart their files start, in ms, positive when the audio starts
 * later. Trimming doesn't change it. Null unless both clips are there.
 */
export function syncOffsetOf({ video, audio }: Clips): number | null {
  return video && audio
    ? Math.round((audio.offset - video.offset) * 1000)
    : null
}

/**
 * Moves the clips to a sync offset (see `syncOffsetOf`). Moves the audio; if that would put it
 * before 0:00, the video moves the other way instead. Clamped to where the clips still overlap,
 * which also keeps a typo from stretching the timeline to days. Leaves the clips alone unless
 * both are there.
 */
export function syncClips(clips: Clips, syncOffset: number): Clips {
  const { video, audio } = clips
  if (!video || !audio) {
    return clips
  }
  const clampedMs = Math.min(
    Math.max(syncOffset, -Math.floor(audio.duration * 1000)),
    Math.floor(video.duration * 1000),
  )
  const gap = clampedMs / 1000
  const audioMin = minOffset(audio)
  if (video.offset + gap >= audioMin) {
    return { video, audio: moveClip(audio, video.offset + gap) }
  }
  return {
    video: moveClip(video, audioMin - gap),
    audio: moveClip(audio, audioMin),
  }
}
