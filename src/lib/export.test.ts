import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Clip, Clips } from './media'

const SAMPLE_RATE = 48000
// 2112 samples of AAC priming, as Apple's encoder writes it.
const PRIMING = 2112

const mb = vi.hoisted(() => {
  const state = {
    conversion: null as null | {
      utilizedTracks: { type: string }[]
      discardedTracks: { track: { type: string }; reason: string }[]
      execute: () => Promise<void>
      onProgress?: (p: number) => void
    },
    audioSources: [] as { options: unknown }[],
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
        options: unknown
        constructor(_config: unknown, options?: unknown) {
          this.options = options
          state.audioSources.push(this)
        }
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

/** The decoded tone has its onset pushed back by the priming samples. */
class FakeOfflineAudioContext {
  static created: FakeOfflineAudioContext[] = []
  static decoded = 0
  destination = {}
  sources: { buffer: unknown; start: ReturnType<typeof vi.fn> }[] = []
  gains: { connect: ReturnType<typeof vi.fn>; gain: { value: number } }[] = []

  length: number

  constructor(_channels: number, length: number) {
    this.length = length
    FakeOfflineAudioContext.created.push(this)
  }

  createOscillator() {
    return { connect: vi.fn(), start: vi.fn() }
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

  async decodeAudioData() {
    FakeOfflineAudioContext.decoded++
    const data = new Float32Array(SAMPLE_RATE / 2)
    data.fill(1, SAMPLE_RATE / 10 + PRIMING)
    return { sampleRate: SAMPLE_RATE, getChannelData: () => data }
  }
}

/** The context that rendered the mix (the others measured the encoder delay). */
function mixContext() {
  return FakeOfflineAudioContext.created.find((c) => c.sources.length > 0)
}

function clip(
  offset: number,
  duration: number,
  trim = { start: 0, end: duration },
): Clip {
  return {
    file: new File([], 'clip'),
    url: 'blob:clip',
    duration,
    offset,
    trim,
    buffer: { duration } as AudioBuffer,
    peaks: null,
  }
}

const gains = { video: 1, audio: 0.5 }

describe('exportSynced', () => {
  let exportSynced: typeof import('./export').exportSynced
  let progress: ReturnType<typeof vi.fn<(fraction: number) => void>>

  beforeEach(async () => {
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext)
    FakeOfflineAudioContext.created = []
    FakeOfflineAudioContext.decoded = 0
    mb.state.audioSources = []
    mb.state.inputs = []
    mb.state.conversion = {
      utilizedTracks: [{ type: 'video' }],
      discardedTracks: [],
      execute: vi.fn(async () => mb.state.conversion!.onProgress?.(1)),
    }
    mb.module.Conversion.init.mockClear()
    mb.module.getFirstEncodableAudioCodec.mockResolvedValue('aac')
    progress = vi.fn()
    // A fresh module, so the encoder delay cache starts empty.
    vi.resetModules()
    ;({ exportSynced } = await import('./export'))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('needs a video', async () => {
    await expect(
      exportSynced({ video: null, audio: clip(0, 10) }, gains, progress),
    ).rejects.toThrow('There’s no video to export.')
  })

  it('needs an audio encoder', async () => {
    mb.module.getFirstEncodableAudioCodec.mockResolvedValue(null)
    const clips: Clips = { video: clip(0, 10), audio: null }
    await expect(exportSynced(clips, gains, progress)).rejects.toThrow(
      'This browser can’t encode audio for export.',
    )
  })

  it('exports the whole video when it isn’t trimmed', async () => {
    const clips: Clips = { video: clip(2, 10), audio: clip(0, 30) }
    const blob = await exportSynced(clips, gains, progress)

    expect(blob.type).toBe('video/mp4')
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
    await exportSynced(clips, gains, progress)
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
    await exportSynced(clips, gains, progress)

    const ctx = mixContext()!
    expect(ctx.sources.map((s) => s.start.mock.calls[0])).toEqual([
      [0, 3, 3],
      [0, 5, 25],
    ])
    expect(ctx.gains.map((g) => g.gain.value)).toEqual([1, 0.5])
  })

  it('leaves muted tracks out of the mix', async () => {
    const clips: Clips = { video: clip(0, 10), audio: clip(0, 10) }
    await exportSynced(clips, { video: 0, audio: 1 }, progress)
    expect(mixContext()?.sources).toHaveLength(1)
  })

  it('cancels the encoder delay, measuring it once per codec', async () => {
    const clips: Clips = { video: clip(0, 10), audio: null }
    await exportSynced(clips, gains, progress)
    await exportSynced(clips, gains, progress)

    expect(FakeOfflineAudioContext.decoded).toBe(1)
    const exported = mb.state.audioSources.filter((s) => s.options)
    expect(exported).toHaveLength(2)
    for (const source of exported) {
      expect(source.options).toEqual({
        startTimestamp: expect.closeTo(-PRIMING / SAMPLE_RATE),
      })
    }
  })

  it('reports progress up to 1', async () => {
    const clips: Clips = { video: clip(0, 10), audio: null }
    await exportSynced(clips, gains, progress)
    expect(progress.mock.calls).toEqual([[0.9], [1]])
  })

  it('explains why the video stream can’t be written', async () => {
    mb.state.conversion!.utilizedTracks = []
    mb.state.conversion!.discardedTracks = [
      { track: { type: 'video' }, reason: 'undecodable_source_codec' },
    ]
    const clips: Clips = { video: clip(0, 10), audio: null }

    await expect(exportSynced(clips, gains, progress)).rejects.toThrow(
      'The video stream can’t be written to MP4 (undecodable_source_codec).',
    )
    expect(mb.state.inputs[0].dispose).toHaveBeenCalled()
  })
})

describe('downloadBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('downloads the blob under the name and frees its URL later', async () => {
    vi.useFakeTimers()
    const revoke = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:out',
      revokeObjectURL: revoke,
    })
    const link = { href: '', download: '', click: vi.fn() }
    vi.stubGlobal('document', { createElement: () => link })
    const { downloadBlob } = await import('./export')

    downloadBlob(new Blob(), 'synced.mp4')

    expect(link).toMatchObject({ href: 'blob:out', download: 'synced.mp4' })
    expect(link.click).toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(revoke).toHaveBeenCalledWith('blob:out')
  })
})
