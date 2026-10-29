import { readFile, writeFile } from 'node:fs/promises'

// Generates the smoke test's media in tests/fixtures. Run with `npm run test:fixtures`.
//   clip.mp4  3 s, 320×180 @ 30 fps H.264 (keyframe every 2 s) + AAC 440 Hz tone at 0.5
//   tone.wav  2 s, 48 kHz stereo 16-bit PCM, 880 Hz tone at 0.5
// Encoding needs WebCodecs, so it runs in Playwright's Chromium.
import { chromium } from '@playwright/test'

const ORIGIN = 'https://fixtures.test' // Served by page.route below; https gives a secure context
const BUNDLE = new URL(
  '../node_modules/mediabunny/dist/bundles/mediabunny.mjs',
  import.meta.url,
)
const OUT = new URL('../tests/fixtures/', import.meta.url)

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.route(`${ORIGIN}/**`, async (route) => {
    const isBundle =
      new URL(route.request().url()).pathname === '/mediabunny.mjs'
    await route.fulfill(
      isBundle
        ? { contentType: 'text/javascript', body: await readFile(BUNDLE) }
        : { contentType: 'text/html', body: '<!doctype html>' },
    )
  })
  await page.goto(ORIGIN)

  const files = await page.evaluate(async () => {
    const url = '/mediabunny.mjs'
    const mb: typeof import('mediabunny') = await import(url)
    const SAMPLE_RATE = 48000
    const FPS = 30

    function tone(freq: number, seconds: number) {
      const ctx = new OfflineAudioContext(2, seconds * SAMPLE_RATE, SAMPLE_RATE)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.value = 0.5
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      return ctx.startRendering()
    }

    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, so it can't move out of evaluate()
    function toBase64(buffer: ArrayBuffer) {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.addEventListener('load', () =>
          resolve((reader.result as string).split(',')[1]),
        )
        reader.readAsDataURL(new Blob([buffer]))
      })
    }

    // Video: a frame counter, so a wrong trim is easy to spot by eye.
    const mp4 = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new mb.BufferTarget(),
    })
    const canvas = new OffscreenCanvas(320, 180)
    const g = canvas.getContext('2d')!
    const frames = new mb.CanvasSource(canvas, {
      codec: 'avc',
      bitrate: 500_000,
      keyFrameInterval: 2,
    })
    const sound = new mb.AudioBufferSource({ codec: 'aac', bitrate: 128_000 })
    mp4.addVideoTrack(frames, { frameRate: FPS })
    mp4.addAudioTrack(sound)
    await mp4.start()
    for (let i = 0; i < 3 * FPS; i++) {
      g.fillStyle = `hsl(${i * 4} 60% 35%)`
      g.fillRect(0, 0, 320, 180)
      g.fillStyle = '#fff'
      g.font = 'bold 72px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(i), 160, 90)
      await frames.add(i / FPS, 1 / FPS)
    }
    frames.close()
    await sound.add(await tone(440, 3))
    sound.close()
    await mp4.finalize()

    const wav = new mb.Output({
      format: new mb.WavOutputFormat(),
      target: new mb.BufferTarget(),
    })
    const pcm = new mb.AudioBufferSource({ codec: 'pcm-s16' })
    wav.addAudioTrack(pcm)
    await wav.start()
    await pcm.add(await tone(880, 2))
    pcm.close()
    await wav.finalize()

    return {
      'clip.mp4': await toBase64(mp4.target.buffer!),
      'tone.wav': await toBase64(wav.target.buffer!),
    }
  })

  for (const [name, data] of Object.entries(files)) {
    await writeFile(new URL(name, OUT), Buffer.from(data, 'base64'))
    console.log(`wrote tests/fixtures/${name}`)
  }
} finally {
  await browser.close()
}
