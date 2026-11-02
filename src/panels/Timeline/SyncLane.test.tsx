import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

import { type Clip, type Clips } from '../../lib/clip'
import { testClip } from '../../lib/testClip'
import { SyncLane } from './SyncLane'

/** Holds the clips like App does, so edits show up in the label, and reports them for checking. */
function Harness({
  initial,
  onChange,
}: {
  initial: Clips
  onChange: (clips: Clips) => void
}) {
  const [clips, setClips] = useState(initial)
  return (
    <SyncLane
      video={clips.video}
      audio={clips.audio}
      pixelsPerSecond={100}
      view={{ start: 0, width: 1000 }}
      onEdit={(kind, edit) => {
        setClips((prev) => {
          const clip = prev[kind]
          const next = clip ? { ...prev, [kind]: edit(clip) } : prev
          onChange(next)
          return next
        })
      }}
    />
  )
}

/** A 10 s video at 1 s and a 10 s audio at `audioOffset`. */
async function mount(audioOffset = 1, video: Clip | null = null) {
  const initial: Clips = {
    video: video ?? testClip({ offset: 1 }),
    audio: testClip({ offset: audioOffset }),
  }
  let clips = initial
  const screen = await render(
    <Harness initial={initial} onChange={(c) => (clips = c)} />,
  )
  return { screen, clips: () => clips }
}

describe('SyncLane', () => {
  it('shows nothing without both clips', async () => {
    const screen = await render(
      <SyncLane
        video={testClip()}
        audio={null}
        pixelsPerSecond={100}
        view={{ start: 0, width: 1000 }}
        onEdit={() => {}}
      />,
    )
    expect(screen.container.querySelector('[data-testid="sync"]')).toBeNull()
    expect(screen.container.querySelector('button')).toBeNull()
  })

  it.each([
    [1, 'In sync'],
    [1.25, '250 ms ahead of audio'],
    [0.9, '100 ms behind audio'],
  ])('describes audio at %s s as "%s"', async (audioOffset, text) => {
    const { screen } = await mount(audioOffset)
    await expect.element(screen.getByTestId('sync')).toHaveTextContent(text)
  })

  it('steps the gap with the buttons', async () => {
    const { screen, clips } = await mount(1)
    const label = screen.getByTestId('sync')

    await screen.getByRole('button', { name: 'Add 5 ms' }).click()
    await expect.element(label).toHaveTextContent('5 ms ahead of audio')
    expect(clips().audio!.offset).toBe(1.005)

    await screen.getByRole('button', { name: 'Add 1 ms' }).click()
    await expect.element(label).toHaveTextContent('6 ms ahead of audio')

    await screen.getByRole('button', { name: 'Subtract 5 ms' }).click()
    await screen.getByRole('button', { name: 'Subtract 1 ms' }).click()
    await expect.element(label).toHaveTextContent('In sync')

    await screen.getByRole('button', { name: 'Subtract 1 ms' }).click()
    await expect.element(label).toHaveTextContent('1 ms behind audio')
    expect(clips().audio!.offset).toBe(0.999)
    expect(clips().video!.offset).toBe(1)
  })

  it('moves the video instead when the audio would go before 0:00', async () => {
    const { screen, clips } = await mount(0, testClip({ offset: 0 }))

    await screen.getByRole('button', { name: 'Subtract 5 ms' }).click()
    await expect
      .element(screen.getByTestId('sync'))
      .toHaveTextContent('5 ms behind audio')
    // Close to, not exactly, 0: the audio's earliest offset is -trim.start, which is -0.
    expect(clips().audio!.offset).toBeCloseTo(0)
    expect(clips().video!.offset).toBe(0.005)
  })

  it('sets the gap typed into the field', async () => {
    const { screen, clips } = await mount(1)
    await screen.getByTestId('sync').click()

    const field = screen.getByRole('textbox', { name: 'Audio offset (ms)' })
    await expect.element(field).toHaveValue('0')
    await field.fill('120')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(screen.getByTestId('sync'))
      .toHaveTextContent('120 ms ahead of audio')
    expect(clips().audio!.offset).toBe(1.12)
  })

  it('ignores a field left empty or not a number', async () => {
    const { screen, clips } = await mount(1.01)
    await screen.getByTestId('sync').click()
    await screen.getByRole('textbox').fill('abc')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(screen.getByTestId('sync'))
      .toHaveTextContent('10 ms ahead of audio')
    expect(clips().audio!.offset).toBe(1.01)
  })

  it('steps live with the arrow keys and puts the gap back on Escape', async () => {
    const { screen, clips } = await mount(1)
    await screen.getByTestId('sync').click()
    const field = screen.getByRole('textbox')

    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await expect.element(field).toHaveValue('2')
    expect(clips().audio!.offset).toBe(1.002)

    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    await expect.element(field).toHaveValue('-8')
    expect(clips().audio!.offset).toBe(0.992)

    await userEvent.keyboard('{Escape}')
    await expect
      .element(screen.getByTestId('sync'))
      .toHaveTextContent('In sync')
    expect(clips().audio!.offset).toBe(1)
  })

  it('steps from the typed value with the buttons, keeping the field open', async () => {
    const { screen, clips } = await mount(1)
    await screen.getByTestId('sync').click()
    const field = screen.getByRole('textbox')
    await field.fill('40')

    await screen.getByRole('button', { name: 'Add 5 ms' }).click()
    await expect.element(field).toHaveValue('45')
    await expect.element(field).toHaveFocus()
    expect(clips().audio!.offset).toBe(1.045)

    await userEvent.keyboard('{Enter}')
    await expect
      .element(screen.getByTestId('sync'))
      .toHaveTextContent('45 ms ahead of audio')
  })
})
