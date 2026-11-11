import type { Locator, Page } from '@playwright/test'

import type { TrackKind } from '../../src/lib/clip.ts'
import { SNAP_PX } from '../../src/lib/snap.ts'

/** How far past its target a snapping drag ends: well inside the app's snap distance. */
const SNAP_SLACK_PX = SNAP_PX / 3

type Drag = {
  /** Timeline seconds to the right, converted at the current zoom. */
  seconds?: number
  /** Pixels down. */
  y?: number
  /** End a little past the target, so it has to snap onto it. */
  snap?: boolean
  /** Hold Shift once grabbed, which turns snapping off. */
  shift?: boolean
}

/** Reads and drives the timeline the way someone using it would. */
export class Timeline {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  clip(kind: TrackKind) {
    return this.page.getByTestId(`clip-${kind}`)
  }

  get sync() {
    return this.page.getByTestId('sync')
  }

  /** The field the sync label turns into when clicked. */
  get offsetField() {
    return this.page.getByLabel('Audio offset (ms)')
  }

  async pixelsPerSecond() {
    const zoom = await this.page
      .getByTestId('timeline')
      .getAttribute('data-pixels-per-second')
    return Number(zoom)
  }

  async toPx(seconds: number) {
    return seconds * (await this.pixelsPerSecond())
  }

  async playheadSeconds() {
    const time = await this.page
      .getByTestId('playhead')
      .getAttribute('data-time')
    return Number(time)
  }

  /** Where a clip's trimmed part starts on the timeline, in seconds. */
  async clipStart(kind: TrackKind) {
    return Number(await this.clip(kind).getAttribute('data-start'))
  }

  /** A clip's trimmed part on the timeline in seconds, as its handles report it, e.g. "1 – 2". */
  async trimSeconds(kind: TrackKind = 'video') {
    const clip = this.clip(kind)
    const start = await clip.getByTestId('trim-start').getAttribute('data-time')
    const end = await clip.getByTestId('trim-end').getAttribute('data-time')
    return `${start} – ${end}`
  }

  /** How far a fade dot sits from its clip's edge, in seconds. */
  async fadeDistance(dot: Locator) {
    return Number(await dot.getAttribute('data-distance'))
  }

  /**
   * Drops focus. Shortcuts are ignored while an input has it, and a focused button would take
   * Space and Enter itself.
   */
  async blur() {
    await this.page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    )
  }

  /**
   * Moves the playhead to `seconds` whole seconds plus `frames` frames with the keyboard.
   * Deselects first, so the arrows move the playhead rather than nudge a clip.
   */
  async movePlayhead(seconds: number, frames = 0) {
    const { keyboard } = this.page
    await this.blur()
    await keyboard.press('Escape')
    await keyboard.press('Home')
    for (let i = 0; i < seconds; i++) {
      await keyboard.press('Shift+ArrowRight')
    }
    for (let i = 0; i < frames; i++) {
      await keyboard.press('ArrowRight')
    }
  }

  /** Sets how far the audio runs ahead, by typing it into the sync label's field. */
  async setOffset(milliseconds: number) {
    await this.sync.click()
    await this.offsetField.fill(String(milliseconds))
    await this.offsetField.press('Enter')
  }

  /** Trims the video to whole seconds, with I and O at the playhead. */
  async trimVideo(startSeconds: number, endSeconds: number) {
    await this.movePlayhead(startSeconds)
    await this.page.keyboard.press('i')
    await this.movePlayhead(endSeconds)
    await this.page.keyboard.press('o')
  }

  /**
   * With the audio at 1.5 s, fades it in from 1.6 s to 1.7 s by dragging its fade dots onto the
   * playhead. The fixture runs at 30 fps, so those are 18 and 21 frames past 1 s; frame steps
   * don't add up to round seconds exactly, so the fade only comes close.
   */
  async fadeAudioIn() {
    const audio = this.clip('audio')
    await this.movePlayhead(1, 21)
    await this.dragBy(audio.getByTestId('fade-start'), {
      seconds: 0.2,
      snap: true,
    })
    await this.movePlayhead(1, 18)
    await this.dragBy(audio.getByTestId('fade-start-silent'), {
      seconds: 0.1,
      snap: true,
    })
  }

  /**
   * Drags a clip's volume line down by `fraction` of its travel; from the top, 0.5 halves it and
   * anything past 1 stops at 0%. The line travels the clip's height, less a pixel at each end.
   */
  async dragVolume(kind: TrackKind, fraction: number) {
    const clip = this.clip(kind)
    const travel = (await clip.boundingBox())!.height - 2
    await this.dragBy(clip.getByTestId('volume'), { y: travel * fraction })
  }

  /** Grabs `target` by its centre and drags it. */
  async dragBy(
    target: Locator,
    { seconds = 0, y = 0, snap = false, shift = false }: Drag,
  ) {
    const { mouse, keyboard } = this.page
    const box = (await target.boundingBox())!
    const fromX = box.x + box.width / 2
    const fromY = box.y + box.height / 2
    const slack = snap ? SNAP_SLACK_PX : 0
    const toX = fromX + (await this.toPx(seconds)) + slack
    await mouse.move(fromX, fromY)
    await mouse.down()
    if (shift) {
      await keyboard.down('Shift')
    }
    await mouse.move(toX, fromY + y, { steps: 5 })
    if (shift) {
      await keyboard.up('Shift')
    }
    await mouse.up()
  }
}
