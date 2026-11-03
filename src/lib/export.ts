// Mediabunny is imported only for its types here and loaded on first export, which keeps it
// out of the initial bundle.
import type { AudioCodec } from 'mediabunny'

import type { Clips, Volumes } from './clip'
import { scheduleClips } from './playback'

const SAMPLE_RATE = 48000

/**
 * Loads the parts of Mediabunny the export uses. Destructuring the dynamic import, rather than
 * keeping the whole module, lets the bundler leave the rest of Mediabunny out of the chunk.
 */
async function loadMediabunny() {
  const {
    ALL_FORMATS,
    AudioBufferSource,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
    getFirstEncodableAudioCodec,
  } = await import('mediabunny')
  return {
    ALL_FORMATS,
    AudioBufferSource,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
    getFirstEncodableAudioCodec,
  }
}

type Mediabunny = Awaited<ReturnType<typeof loadMediabunny>>

function createMp4Output(mb: Mediabunny) {
  const target = new mb.BufferTarget()
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
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
  gains: Volumes,
  start: number,
  duration: number,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    2,
    Math.ceil(duration * SAMPLE_RATE),
    SAMPLE_RATE,
  )
  scheduleClips(ctx, clips, start, 0, (kind) => {
    if (gains[kind] <= 0) {
      return null
    }
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
async function measureEncoderDelay(
  mb: Mediabunny,
  codec: AudioCodec,
): Promise<number> {
  const cached = encoderDelays.get(codec)
  if (cached !== undefined) {
    return cached
  }

  const onset = 0.1
  const tone = new OfflineAudioContext(2, SAMPLE_RATE / 2, SAMPLE_RATE)
  const osc = tone.createOscillator()
  osc.connect(tone.destination)
  osc.start(onset)

  const { output, target } = createMp4Output(mb)
  const source = new mb.AudioBufferSource({
    codec,
    quality: new mb.Quality('high'),
  })
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
 * Builds an MP4 of the video clip's trimmed part. The video's encoded frames are copied
 * untouched whenever possible (no quality loss) and a freshly encoded audio track holds
 * the synced mix.
 */
export async function exportSynced(
  clips: Clips,
  gains: Volumes,
): Promise<Blob> {
  const video = clips.video
  if (!video) {
    throw new Error('There’s no video to export.')
  }
  const { trim } = video

  const mb = await loadMediabunny()
  const audioCodec = await mb.getFirstEncodableAudioCodec(['aac', 'opus'], {
    numberOfChannels: 2,
    sampleRate: SAMPLE_RATE,
  })
  if (!audioCodec) {
    throw new Error('This browser can’t encode audio for export.')
  }

  const input = new mb.Input({
    source: new mb.BlobSource(video.file),
    formats: mb.ALL_FORMATS,
  })
  try {
    const { output, target } = createMp4Output(mb)
    const [conversion, encoderDelay, mix] = await Promise.all([
      // The conversion copies the video and handles cuts that don't land on a keyframe,
      // keeping the exact start and end. Our own mixed audio track is added next to it.
      mb.Conversion.init({
        input,
        output,
        composable: true,
        tracks: 'primary',
        audio: { discard: true },
        trim,
        showWarnings: false,
      }),
      measureEncoderDelay(mb, audioCodec),
      mixAudio(clips, gains, video.offset + trim.start, trim.end - trim.start),
    ])
    if (!conversion.utilizedTracks.some((track) => track.type === 'video')) {
      const discarded = conversion.discardedTracks.find(
        (d) => d.track.type === 'video',
      )
      const reason = discarded?.reason ?? 'no video track found'
      throw new Error(`The video stream can’t be written to MP4 (${reason}).`)
    }
    const audioSource = new mb.AudioBufferSource(
      { codec: audioCodec, quality: new mb.Quality('high') },
      { startTimestamp: -encoderDelay },
    )
    output.addAudioTrack(audioSource)
    await output.start()

    await Promise.all([
      conversion.execute(),
      audioSource.add(mix).then(() => audioSource.close()),
    ])

    await output.finalize()
    return new Blob([target.buffer!], { type: 'video/mp4' })
  } finally {
    input.dispose()
  }
}

/** Exports the synced video and downloads it, named after the video file. */
export async function saveExport(clips: Clips, gains: Volumes) {
  if (!clips.video) {
    return
  }
  const blob = await exportSynced(clips, gains)
  const name = clips.video.file.name.replace(/\.[^.]+$/, '')
  downloadBlob(blob, `${name}-synced.mp4`)
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
