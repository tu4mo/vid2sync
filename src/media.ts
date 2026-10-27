export type TrackKind = 'video' | 'audio'

export const TRACK_KINDS: readonly TrackKind[] = ['video', 'audio']

export interface Peaks {
  perSecond: number
  min: Float32Array
  max: Float32Array
}

export interface Clip {
  file: File
  url: string
  duration: number
  /** Position of the clip's start on the timeline, in seconds. */
  offset: number
  /** Decoded audio, or null when the file has no decodable audio track. */
  buffer: AudioBuffer | null
  peaks: Peaks | null
}

export type Clips = Record<TrackKind, Clip | null>

export interface TimeRange {
  start: number
  end: number
}

const PEAKS_PER_SECOND = 200

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
        if (v < lo) lo = v
        else if (v > hi) hi = v
      }
    }
    min[i] = lo
    max[i] = hi
  }

  return { perSecond: buffer.sampleRate / bucket, min, max }
}

function readDuration(url: string, kind: TrackKind): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(kind)
    el.preload = 'metadata'
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : 0)
    el.onerror = () => resolve(0)
    el.src = url
  })
}

export async function loadClip(file: File, kind: TrackKind, ctx: AudioContext): Promise<Clip> {
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
    throw new Error(`Could not read “${file.name}”. Is it a supported ${kind} format?`)
  }

  return {
    file,
    url,
    duration,
    offset: 0,
    buffer,
    peaks: buffer ? computePeaks(buffer) : null,
  }
}

const VIDEO_EXTENSIONS = ['mov', 'mp4', 'm4v', 'webm', 'mkv', 'avi', '3gp']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'aif', 'aiff', 'caf']

/**
 * Starts every clip's audio so that timeline time `from` sounds at context time `at`.
 * Live playback and the export mix both use this, so they place audio identically.
 * `output` returns where a track's audio goes, or null to leave the track out.
 */
export function scheduleClips(
  ctx: BaseAudioContext,
  clips: Clips,
  from: number,
  at: number,
  output: (kind: TrackKind) => AudioNode | null,
): AudioBufferSourceNode[] {
  const sources: AudioBufferSourceNode[] = []
  for (const kind of TRACK_KINDS) {
    const clip = clips[kind]
    if (!clip?.buffer) continue
    const delay = clip.offset - from
    const into = Math.max(0, -delay)
    if (into >= clip.buffer.duration) continue
    const destination = output(kind)
    if (!destination) continue

    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    source.connect(destination)
    source.start(at + Math.max(0, delay), into)
    sources.push(source)
  }
  return sources
}

export function kindForFile(file: File): TrackKind | null {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  // Files dragged from some apps (e.g. macOS Photos) can arrive without a MIME type.
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio'
  return null
}

export function formatTime(t: number): string {
  const sign = t < 0 ? '-' : ''
  const abs = Math.abs(t)
  const m = Math.floor(abs / 60)
  const s = abs - m * 60
  return `${sign}${m}:${s.toFixed(3).padStart(6, '0')}`
}
