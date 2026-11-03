import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import { Waveform } from './Waveform'

describe('Waveform', () => {
  it('spans the time its peaks cover, at the zoom', async () => {
    // 3 buckets at 200 per second cover 15 ms, so 150 px at 10,000 px/s.
    const peaks = {
      perSecond: 200,
      min: new Float32Array([-0.5, -1, 0]),
      max: new Float32Array([0.5, 1, 0]),
    }
    const screen = await render(
      <Waveform peaks={peaks} pixelsPerSecond={10_000} color="red" />,
    )
    const svg = screen.getByTestId('waveform').element() as SVGSVGElement
    expect(svg.getBoundingClientRect().width).toBe(150)
  })
})
