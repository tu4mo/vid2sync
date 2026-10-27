import { scheduleClips, type Clips, type TrackKind } from './media'

// Small scheduling lead so every source starts on the same audio-clock tick.
const LEAD = 0.05

/**
 * Plays every track's audio through Web Audio, scheduled against a single
 * AudioContext clock, so the two tracks stay sample-accurately in sync.
 * The timeline position is derived from that same clock.
 */
export class Engine {
  readonly ctx = new AudioContext()
  playing = false
  private clips: Clips = { video: null, audio: null }
  private anchorCtx = 0
  private anchorTime = 0
  private sources: AudioBufferSourceNode[] = []
  private gains: Record<TrackKind, GainNode>

  constructor() {
    this.gains = { video: this.ctx.createGain(), audio: this.ctx.createGain() }
    for (const gain of Object.values(this.gains)) gain.connect(this.ctx.destination)
  }

  now(): number {
    if (!this.playing) return this.anchorTime
    return this.anchorTime + Math.max(0, this.ctx.currentTime - this.anchorCtx)
  }

  /** Updates the clips, re-scheduling audio if they change during playback. */
  setClips(clips: Clips) {
    this.clips = clips
    if (this.playing) this.play(this.now())
  }

  play(from: number) {
    this.stopSources()
    void this.ctx.resume()
    this.anchorCtx = this.ctx.currentTime + LEAD
    this.anchorTime = from
    this.playing = true
    this.sources = scheduleClips(this.ctx, this.clips, from, this.anchorCtx, (kind) => this.gains[kind])
  }

  pause() {
    this.anchorTime = this.now()
    this.playing = false
    this.stopSources()
  }

  seek(t: number) {
    if (this.playing) this.play(t)
    else this.anchorTime = t
  }

  setGain(kind: TrackKind, gain: number) {
    // Short ramp so dragging a volume slider doesn't click.
    this.gains[kind].gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01)
  }

  private stopSources() {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // already stopped
      }
      source.disconnect()
    }
    this.sources = []
  }
}
