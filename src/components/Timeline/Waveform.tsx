import { memo, useEffect, useRef } from 'react'

import type { Peaks } from '../../media'

// Browsers cap canvas dimensions; beyond this the bitmap is stretched.
const MAX_CANVAS_WIDTH = 16384

interface Props {
  peaks: Peaks
  duration: number
  width: number
  height: number
  color: string
}

export const Waveform = memo(function Waveform({
  peaks,
  duration,
  width,
  height,
  color,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return

    const dpr = window.devicePixelRatio || 1
    const cw = Math.max(1, Math.min(Math.round(width * dpr), MAX_CANVAS_WIDTH))
    const ch = Math.max(1, Math.round(height * dpr))
    canvas.width = cw
    canvas.height = ch
    g.clearRect(0, 0, cw, ch)
    g.fillStyle = color

    const mid = ch / 2
    const bucketsPerPixel = (peaks.perSecond * duration) / cw
    const count = peaks.min.length

    for (let x = 0; x < cw; x++) {
      const i0 = Math.floor(x * bucketsPerPixel)
      if (i0 >= count) break
      const i1 = Math.min(
        count,
        Math.max(i0 + 1, Math.floor((x + 1) * bucketsPerPixel)),
      )
      let lo = 0
      let hi = 0
      for (let i = i0; i < i1; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i]
        if (peaks.max[i] > hi) hi = peaks.max[i]
      }
      const top = mid - hi * mid
      const bottom = mid - lo * mid
      g.fillRect(x, top, 1, Math.max(1, bottom - top))
    }
  }, [peaks, duration, width, height, color])

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute top-1 left-0 block"
      style={{ width, height }}
    />
  )
})
