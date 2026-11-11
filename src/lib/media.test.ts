import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadClip, routeFiles } from './media'

function fakeBuffer(channels: number[][], sampleRate: number) {
  const length = channels[0].length
  return {
    sampleRate,
    length,
    duration: length / sampleRate,
    numberOfChannels: channels.length,
    getChannelData: (channel: number) => Float32Array.from(channels[channel]),
  } as unknown as AudioBuffer
}

/** Fakes the media element that reads the duration: fires `event` once it gets a src. */
function stubMediaElement(event: 'loadedmetadata' | 'error', duration: number) {
  vi.stubGlobal('document', {
    createElement: () => {
      const media = new EventTarget() as EventTarget & Record<string, unknown>
      Object.defineProperty(media, 'src', {
        set: () => {
          queueMicrotask(() => media.dispatchEvent(new Event(event)))
        },
      })
      media.duration = duration
      return media
    },
  })
}

function stubUrls() {
  const revoke = vi.fn()
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:test',
    revokeObjectURL: revoke,
  })
  return revoke
}

describe('loadClip', () => {
  afterEach(() => vi.unstubAllGlobals())

  const file = new File(['data'], 'take.wav')

  it('reads the duration and computes peaks from the decoded audio', async () => {
    stubUrls()
    stubMediaElement('loadedmetadata', 12)
    // 400 Hz gives 2-sample buckets; peaks span every channel.
    const buffer = fakeBuffer(
      [
        [0.5, -0.2, 0.1, 0.3],
        [0, -0.9, 0.8, 0],
      ],
      400,
    )
    const audioContext = {
      decodeAudioData: async () => buffer,
    } as unknown as AudioContext

    const clip = await loadClip(file, 'audio', audioContext)

    expect(clip).toMatchObject({
      file,
      url: 'blob:test',
      duration: 12,
      offset: 0,
      trim: { start: 0, end: 12 },
      buffer,
    })
    expect(clip.peaks?.perSecond).toBe(200)
    expect(Array.from(clip.peaks!.min)).toEqual([-0.9, 0].map(Math.fround))
    expect(Array.from(clip.peaks!.max)).toEqual([0.5, 0.8].map(Math.fround))
  })

  it('falls back to the decoded duration when the metadata is unreadable', async () => {
    stubUrls()
    stubMediaElement('error', NaN)
    const buffer = fakeBuffer([[0, 0, 0, 0]], 2)
    const audioContext = {
      decodeAudioData: async () => buffer,
    } as unknown as AudioContext

    expect((await loadClip(file, 'audio', audioContext)).duration).toBe(2)
  })

  it('keeps clips without decodable audio', async () => {
    stubUrls()
    stubMediaElement('loadedmetadata', 5)
    const audioContext = {
      decodeAudioData: () => Promise.reject(new Error('no audio')),
    } as unknown as AudioContext

    expect(await loadClip(file, 'video', audioContext)).toMatchObject({
      buffer: null,
      peaks: null,
    })
  })

  it('rejects files with no readable duration and frees their URL', async () => {
    const revoke = stubUrls()
    stubMediaElement('loadedmetadata', Infinity)
    const audioContext = {
      decodeAudioData: () => Promise.reject(new Error('no audio')),
    } as unknown as AudioContext

    await expect(loadClip(file, 'video', audioContext)).rejects.toThrow(
      'Could not read “take.wav”. Is it a supported video format?',
    )
    expect(revoke).toHaveBeenCalledWith('blob:test')
  })
})

/** The track routeFiles puts a lone file on; null if it's left out. */
function kindForFile(file: File) {
  return routeFiles([file]).imports[0]?.kind ?? null
}

describe('routeFiles', () => {
  it('uses the MIME type', () => {
    expect(kindForFile(new File([], 'a.bin', { type: 'video/mp4' }))).toBe(
      'video',
    )
    expect(kindForFile(new File([], 'a.bin', { type: 'audio/wav' }))).toBe(
      'audio',
    )
  })

  it('falls back to the extension when there is no MIME type', () => {
    expect(kindForFile(new File([], 'IMG_0001.MOV'))).toBe('video')
    expect(kindForFile(new File([], 'take.aiff'))).toBe('audio')
  })

  it('returns null for other files', () => {
    expect(
      kindForFile(new File([], 'notes.txt', { type: 'text/plain' })),
    ).toBeNull()
    expect(kindForFile(new File([], 'README'))).toBeNull()
  })

  const video = new File([], 'take.mov')
  const audio = new File([], 'take.wav')

  it('puts each file on the track for its type', () => {
    expect(routeFiles([video, audio])).toEqual({
      imports: [
        { file: video, kind: 'video' },
        { file: audio, kind: 'audio' },
      ],
      error: null,
    })
  })

  it('leaves out a second file of the same kind', () => {
    const second = new File([], 'other.mp4')
    expect(routeFiles([video, second])).toEqual({
      imports: [{ file: video, kind: 'video' }],
      error: 'Only one video file can be imported at a time.',
    })
  })

  it('leaves out files that are neither video nor audio', () => {
    const notes = new File([], 'notes.txt')
    expect(routeFiles([notes, audio])).toEqual({
      imports: [{ file: audio, kind: 'audio' }],
      error: '“notes.txt” doesn’t look like a video or audio file.',
    })
  })

  it('says when there are no files, as from a failed drop', () => {
    expect(routeFiles([])).toEqual({
      imports: [],
      error: 'The drop didn’t contain a file.',
    })
  })
})
