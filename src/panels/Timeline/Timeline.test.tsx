import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import { testClip } from '../../test/testClip'
import { Timeline } from './Timeline'

function noop() {}

function mount(disabled = false) {
  return render(
    <Timeline
      clips={{ video: testClip(), audio: testClip() }}
      volume={{ video: 1, audio: 1 }}
      selected={null}
      time={0}
      end={10}
      pixelsPerSecond={50}
      playing={false}
      followPlayhead={false}
      disabled={disabled}
      gliding={false}
      onSelect={noop}
      onEdit={noop}
      onSeek={noop}
      onPlayPastTimeline={noop}
      onVolumeChange={noop}
      onImport={noop}
      onZoom={noop}
    />,
  )
}

describe('Timeline', () => {
  it('shows the clips, with no spinner, when not disabled', async () => {
    const screen = await mount()
    await expect.element(screen.getByTestId('clip-video')).toBeVisible()
    expect(screen.container.querySelector('[role="status"]')).toBeNull()
  })

  it('disables the clips under a spinner', async () => {
    const screen = await mount(true)
    await expect.element(screen.getByRole('status')).toBeVisible()
    await expect.element(screen.getByTestId('clip-video')).toBeVisible()
    const clip = screen.getByTestId('clip-video').element()
    expect(clip.closest('[inert]')).not.toBeNull()
  })
})
