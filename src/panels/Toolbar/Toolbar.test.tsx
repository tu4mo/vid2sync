import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import { Toolbar } from './Toolbar'

async function mount(canNudge: boolean) {
  const nudges: number[] = []
  const screen = await render(
    <Toolbar
      disabled={false}
      playing={false}
      hasClips
      canExport
      autoSync={{ status: 'matched', syncOffset: 0 }}
      autoSyncCount={0}
      zoom={8}
      followPlayhead
      onPlay={() => {}}
      onPause={() => {}}
      onSeek={() => {}}
      onExport={() => {}}
      onAutoSync={() => {}}
      canNudge={canNudge}
      onNudge={(ms) => nudges.push(ms)}
      onZoom={() => {}}
      onToggleFollowPlayhead={() => {}}
    />,
  )
  return { screen, nudges }
}

describe('Toolbar', () => {
  it('nudges the selected clip with the buttons either side of the wand', async () => {
    const { screen, nudges } = await mount(true)

    await screen.getByRole('button', { name: 'Move 5 ms earlier' }).click()
    await screen.getByRole('button', { name: 'Move 1 ms earlier' }).click()
    await screen.getByRole('button', { name: 'Move 1 ms later' }).click()
    await screen.getByRole('button', { name: 'Move 5 ms later' }).click()
    expect(nudges).toEqual([-5, -1, 1, 5])
  })

  it('disables the nudge buttons without a selected clip', async () => {
    const { screen } = await mount(false)
    await expect
      .element(screen.getByRole('button', { name: 'Move 1 ms later' }))
      .toBeDisabled()
  })
})
