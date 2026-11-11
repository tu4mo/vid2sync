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
  const audioContext = new OfflineAudioContext(
    2,
    Math.ceil(duration * SAMPLE_RATE),
    SAMPLE_RATE,
  )
  scheduleClips(audioContext, clips, start, 0, (kind) => {
    if (gains[kind] <= 0) {
      return null
    }
    const gain = audioContext.createGain()
    gain.gain.value = gains[kind]
    gain.connect(audioContext.destination)
    return gain
  })
  return audioContext.startRendering()
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
    const target = new mb.BufferTarget()
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target,
    })
    const [conversion, mix] = await Promise.all([
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
      mixAudio(clips, gains, video.offset + trim.start, trim.end - trim.start),
    ])
    if (!conversion.utilizedTracks.some((track) => track.type === 'video')) {
      const discarded = conversion.discardedTracks.find(
        (entry) => entry.track.type === 'video',
      )
      const reason = discarded?.reason ?? 'no video track found'
      throw new Error(`The video stream can’t be written to MP4 (${reason}).`)
    }
    // Mediabunny cancels the encoder's priming delay itself, so the mix starts at 0.
    const audioSource = new mb.AudioBufferSource({
      codec: audioCodec,
      quality: new mb.Quality('high'),
    })
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
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
