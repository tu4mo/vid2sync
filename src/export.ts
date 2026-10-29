import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  type AudioCodec,
} from 'mediabunny'

import {
  scheduleClips,
  type Clips,
  type TimeRange,
  type TrackKind,
} from './media'

const SAMPLE_RATE = 48000

function createMp4Output() {
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })
  return { output, target }
}

/**
 * Renders what you hear from timeline time `start` for `duration` seconds, using the same
 * clip placement as live playback. Gaps are silent.
 */
async function mixAudio(
  clips: Clips,
  gains: Record<TrackKind, number>,
  start: number,
  duration: number,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(duration * SAMPLE_RATE),
    SAMPLE_RATE,
  )
  scheduleClips(ctx, clips, start, 0, (kind) => {
    if (gains[kind] <= 0) return null
    const gain = ctx.createGain()
    gain.gain.value = gains[kind]
    gain.connect(ctx.destination)
    return gain
  })
  return ctx.startRendering()
}

const encoderDelays = new Map<AudioCodec, number>()

/**
 * Encoders prepend "priming" silence (2112 samples for Apple's AAC), which would make the
 * exported audio late. Measure it once by encoding a tone with a known onset, so it can be
 * cancelled with a negative start timestamp (written as an MP4 edit list).
 */
async function measureEncoderDelay(codec: AudioCodec): Promise<number> {
  const cached = encoderDelays.get(codec)
  if (cached !== undefined) return cached

  const onset = 0.1
  const tone = new OfflineAudioContext(2, SAMPLE_RATE / 2, SAMPLE_RATE)
  const osc = tone.createOscillator()
  osc.connect(tone.destination)
  osc.start(onset)

  const { output, target } = createMp4Output()
  const source = new AudioBufferSource({ codec, quality: QUALITY_HIGH })
  output.addAudioTrack(source)
  await output.start()
  await source.add(await tone.startRendering())
  source.close()
  await output.finalize()

  const decoded = await new OfflineAudioContext(
    2,
    1,
    SAMPLE_RATE,
  ).decodeAudioData(target.buffer!)
  const data = decoded.getChannelData(0)
  const index = data.findIndex((v) => Math.abs(v) > 0.1)
  const delay = index < 0 ? 0 : Math.max(0, index / decoded.sampleRate - onset)
  encoderDelays.set(codec, delay)
  return delay
}

/**
 * Builds an MP4 of the timeline `range` (or the whole video when null), limited to where the
 * video is. The video's encoded frames are copied untouched whenever possible (no quality
 * loss) and a freshly encoded audio track holds the synced mix.
 */
export async function exportSynced(
  clips: Clips,
  gains: Record<TrackKind, number>,
  range: TimeRange | null,
  onProgress: (fraction: number) => void,
): Promise<Blob> {
  const video = clips.video
  if (!video) throw new Error('There’s no video to export.')
  const trim = {
    start: Math.max(0, (range?.start ?? video.offset) - video.offset),
    end: Math.min(video.duration, (range?.end ?? Infinity) - video.offset),
  }
  if (trim.end <= trim.start)
    throw new Error('The export range doesn’t overlap the video.')

  const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], {
    numberOfChannels: 2,
    sampleRate: SAMPLE_RATE,
  })
  if (!audioCodec)
    throw new Error('This browser can’t encode audio for export.')

  const input = new Input({
    source: new BlobSource(video.file),
    formats: ALL_FORMATS,
  })
  try {
    const { output, target } = createMp4Output()
    const [conversion, encoderDelay, mix] = await Promise.all([
      // The conversion copies the video and handles cuts that don't land on a keyframe,
      // keeping the exact start and end. Our own mixed audio track is added next to it.
      Conversion.init({
        input,
        output,
        composable: true,
        tracks: 'primary',
        audio: { discard: true },
        trim,
        showWarnings: false,
      }),
      measureEncoderDelay(audioCodec),
      mixAudio(clips, gains, video.offset + trim.start, trim.end - trim.start),
    ])
    if (!conversion.utilizedTracks.some((track) => track.type === 'video')) {
      const discarded = conversion.discardedTracks.find(
        (d) => d.track.type === 'video',
      )
      const reason = discarded?.reason ?? 'no video track found'
      throw new Error(`The video stream can’t be written to MP4 (${reason}).`)
    }
    conversion.onProgress = (p) => onProgress(p * 0.9)

    const audioSource = new AudioBufferSource(
      { codec: audioCodec, quality: QUALITY_HIGH },
      { startTimestamp: -encoderDelay },
    )
    output.addAudioTrack(audioSource)
    await output.start()

    await Promise.all([
      conversion.execute(),
      audioSource.add(mix).then(() => audioSource.close()),
    ])

    await output.finalize()
    onProgress(1)
    return new Blob([target.buffer!], { type: 'video/mp4' })
  } finally {
    input.dispose()
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
