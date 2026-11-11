import { NO_FADE, type Clip, type Peaks, type TrackKind } from './clip'

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
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < count; i++) {
      const [low, high] = sampleRange(
        data,
        i * bucket,
        Math.min(data.length, (i + 1) * bucket),
      )
      min[i] = Math.min(min[i], low)
      max[i] = Math.max(max[i], high)
    }
  }
  return { perSecond: buffer.sampleRate / bucket, min, max }
}

/** The lowest and highest sample from `start` up to `end`, counting from 0 (silence). */
function sampleRange(data: Float32Array, start: number, end: number) {
  let low = 0
  let high = 0
  for (let sample = start; sample < end; sample++) {
    low = Math.min(low, data[sample])
    high = Math.max(high, data[sample])
  }
  return [low, high] as const
}

/** Reads the file's duration from its metadata; 0 when the browser can't tell. */
function readDuration(url: string, kind: TrackKind): Promise<number> {
  return new Promise((resolve) => {
    const media = document.createElement(kind)
    media.preload = 'metadata'
    media.addEventListener('loadedmetadata', () =>
      resolve(Number.isFinite(media.duration) ? media.duration : 0),
    )
    media.addEventListener('error', () => resolve(0))
    media.src = url
  })
}

/**
 * Loads a dropped file as a clip, decoding its audio when it has any. It starts at 0:00; the
 * caller places it. Throws when neither the metadata nor the audio gives a duration.
 */
export async function loadClip(
  file: File,
  kind: TrackKind,
  audioContext: AudioContext,
): Promise<Clip> {
  const url = URL.createObjectURL(file)
  const [metaDuration, buffer] = await Promise.all([
    readDuration(url, kind),
    file
      .arrayBuffer()
      .then((data) => audioContext.decodeAudioData(data))
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

/** The files to import with the track each goes on, and why any were left out. */
export type FileRoutes = {
  imports: { file: File; kind: TrackKind }[]
  /** About the last file left out, or null when none were. */
  error: string | null
}

/**
 * Picks the track for each file by its type. A track holds one clip, so a second file of the same
 * kind is left out rather than racing the first.
 */
export function routeFiles(files: File[]): FileRoutes {
  const imports: FileRoutes['imports'] = []
  // A drop can hold no files, as when dragging from Photos goes wrong.
  let error = files.length === 0 ? 'The drop didn’t contain a file.' : null
  for (const file of files) {
    const kind = kindForFile(file)
    if (!kind) {
      error = `“${file.name}” doesn’t look like a video or audio file.`
    } else if (imports.some((imported) => imported.kind === kind)) {
      error = `Only one ${kind} file can be imported at a time.`
    } else {
      imports.push({ file, kind })
    }
  }
  return { imports, error }
}
