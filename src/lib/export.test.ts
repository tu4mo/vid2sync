import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { testClip } from '../test/testClip'
import type { Clip, Clips } from './clip'
import { saveExport } from './export'

const SAMPLE_RATE = 48000

const mb = vi.hoisted(() => {
  const state = {
    conversion: null as null | {
      utilizedTracks: { type: string }[]
      discardedTracks: { track: { type: string }; reason: string }[]
      execute: () => Promise<void>
    },
    inputs: [] as { dispose: ReturnType<typeof vi.fn> }[],
  }
  return {
    state,
    module: {
      ALL_FORMATS: [],
      Quality: vi.fn(),
      getFirstEncodableAudioCodec: vi.fn(async () => 'aac' as string | null),
      BlobSource: vi.fn(),
      Mp4OutputFormat: vi.fn(),
      BufferTarget: class {
        buffer = new ArrayBuffer(4)
      },
      Output: class {
        addAudioTrack = vi.fn()
        start = vi.fn(async () => {})
        finalize = vi.fn(async () => {})
      },
      AudioBufferSource: class {
        add = vi.fn(async () => {})
        close = vi.fn()
      },
      Input: class {
        dispose = vi.fn()
        constructor() {
          state.inputs.push(this)
        }
      },
      Conversion: {
        init: vi.fn(async () => state.conversion!),
      },
    },
  }
})

vi.mock('mediabunny', () => mb.module)

class FakeOfflineAudioContext {
  static created: FakeOfflineAudioContext[] = []
  destination = {}
  sources: { buffer: unknown; start: ReturnType<typeof vi.fn> }[] = []
  gains: { connect: ReturnType<typeof vi.fn>; gain: { value: number } }[] = []

  length: number

  constructor(_channels: number, length: number) {
    this.length = length
    FakeOfflineAudioContext.created.push(this)
  }

  createGain() {
    const gain = { connect: vi.fn(), gain: { value: 1 } }
    this.gains.push(gain)
    return gain
  }

  createBufferSource() {
    const source = { buffer: null, connect: vi.fn(), start: vi.fn() }
    this.sources.push(source)
    return source
  }

  async startRendering() {
    return { length: this.length }
  }
}

/** The context that rendered the mix. */
function mixContext() {
  return FakeOfflineAudioContext.created[0]
}

function clip(
  offset: number,
  duration: number,
  trim = { start: 0, end: duration },
): Clip {
  return testClip({
    duration,
    offset,
    trim,
    buffer: { duration } as AudioBuffer,
  })
}

const gains = { video: 1, audio: 0.5 }

const download = {
  link: { href: '', download: '', click: vi.fn() },
  blob: null as Blob | null,
  revoke: vi.fn(),
}

/** Exports the clips and returns the blob handed to the download. */
async function exportBlob(clips: Clips, volumes = gains) {
  await saveExport(clips, volumes)
  return download.blob
}

describe('saveExport', () => {
  beforeEach(() => {
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext)
    FakeOfflineAudioContext.created = []
    mb.state.inputs = []
    mb.state.conversion = {
      utilizedTracks: [{ type: 'video' }],
      discardedTracks: [],
      execute: vi.fn(async () => {}),
    }
    mb.module.Conversion.init.mockClear()
    mb.module.getFirstEncodableAudioCodec.mockResolvedValue('aac')

    download.link = { href: '', download: '', click: vi.fn() }
    download.blob = null
    download.revoke = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        download.blob = blob
        return 'blob:out'
      },
      revokeObjectURL: download.revoke,
    })
    vi.stubGlobal('document', { createElement: () => download.link })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('does nothing without a video', async () => {
    await saveExport({ video: null, audio: clip(0, 10) }, gains)
    expect(mb.module.Conversion.init).not.toHaveBeenCalled()
    expect(download.link.click).not.toHaveBeenCalled()
  })

  it('needs an audio encoder', async () => {
    mb.module.getFirstEncodableAudioCodec.mockResolvedValue(null)
    const clips: Clips = { video: clip(0, 10), audio: null }
    await expect(saveExport(clips, gains)).rejects.toThrow(
      'This browser can’t encode audio for export.',
    )
  })

  it('exports the whole video when it isn’t trimmed', async () => {
    const clips: Clips = { video: clip(2, 10), audio: clip(0, 30) }
    const blob = await exportBlob(clips)

    expect(blob?.type).toBe('video/mp4')
    expect(mb.module.Conversion.init).toHaveBeenCalledWith(
      expect.objectContaining({
        trim: { start: 0, end: 10 },
        audio: { discard: true },
      }),
    )
    expect(mixContext()?.length).toBe(10 * SAMPLE_RATE)
    expect(mb.state.inputs[0].dispose).toHaveBeenCalled()
  })

  it('exports the trimmed part of the video', async () => {
    const clips: Clips = {
      video: clip(2, 10, { start: 3, end: 6 }),
      audio: null,
    }
    await exportBlob(clips)
    expect(mb.module.Conversion.init).toHaveBeenCalledWith(
      expect.objectContaining({ trim: { start: 3, end: 6 } }),
    )
    expect(mixContext()?.length).toBe(3 * SAMPLE_RATE)
  })

  it('mixes the tracks from the start of the trim at their gains', async () => {
    const clips: Clips = {
      video: clip(2, 10, { start: 3, end: 6 }),
      audio: clip(0, 30),
    }
    await exportBlob(clips)

    const audioContext = mixContext()!
    expect(
      audioContext.sources.map((source) => source.start.mock.calls[0]),
    ).toEqual([
      [0, 3, 3],
      [0, 5, 25],
    ])
    expect(audioContext.gains.map((gain) => gain.gain.value)).toEqual([1, 0.5])
  })

  it('leaves muted tracks out of the mix', async () => {
    const clips: Clips = { video: clip(0, 10), audio: clip(0, 10) }
    await exportBlob(clips, { video: 0, audio: 1 })
    expect(mixContext()?.sources).toHaveLength(1)
  })

  it('explains why the video stream can’t be written', async () => {
    mb.state.conversion!.utilizedTracks = []
    mb.state.conversion!.discardedTracks = [
      { track: { type: 'video' }, reason: 'undecodable_source_codec' },
    ]
    const clips: Clips = { video: clip(0, 10), audio: null }

    await expect(saveExport(clips, gains)).rejects.toThrow(
      'The video stream can’t be written to MP4 (undecodable_source_codec).',
    )
    expect(mb.state.inputs[0].dispose).toHaveBeenCalled()
  })

  it('downloads the export named after the video and frees its URL later', async () => {
    vi.useFakeTimers()
    const video = { ...clip(0, 10), file: new File([], 'trip.mov') }

    await saveExport({ video, audio: null }, gains)

    expect(download.link).toMatchObject({
      href: 'blob:out',
      download: 'trip-synced.mp4',
    })
    expect(download.link.click).toHaveBeenCalled()
    expect(download.revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(download.revoke).toHaveBeenCalledWith('blob:out')
    vi.useRealTimers()
  })
})
