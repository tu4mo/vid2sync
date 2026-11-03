import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Peaks } from '../../lib/clip'

type Props = {
  peaks: Peaks
  /** The time into the file at the canvas's left edge, in seconds. */
  startTime: number
  pixelsPerSecond: number
  /** Where the canvas sits in the clip, in px. */
  left: number
  /** The canvas's width in px; only the part of the clip around the screen is drawn. */
  width: number
  color: string
}

export function Waveform({
  peaks,
  startTime,
  pixelsPerSecond,
  left,
  width,
  color,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  // The canvas stretches with its lane; redraw at the height it ends up.
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) {
      return
    }
    const observer = new ResizeObserver(() => setHeight(canvas.clientHeight))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  // Before paint, so the canvas never shows at its new place and size with the old drawing.
  useLayoutEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    // The canvas's bitmap is in device pixels, so it's sharp on high-density screens.
    const pixelRatio = window.devicePixelRatio || 1
    const canvasWidth = Math.max(1, Math.round(width * pixelRatio))
    const canvasHeight = Math.max(1, Math.round(height * pixelRatio))
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    context.clearRect(0, 0, canvasWidth, canvasHeight)
    context.fillStyle = color

    const middle = canvasHeight / 2
    // A bucket is one min/max pair in `peaks`. At high zoom a pixel covers less than one bucket.
    const bucketsPerPixel = peaks.perSecond / (pixelsPerSecond * pixelRatio)
    const firstBucket = startTime * peaks.perSecond
    const bucketCount = peaks.min.length

    // One vertical bar per device pixel, spanning the lowest to the highest sample it covers.
    for (let pixel = 0; pixel < canvasWidth; pixel++) {
      const fromBucket = Math.max(
        0,
        Math.floor(firstBucket + pixel * bucketsPerPixel),
      )
      if (fromBucket >= bucketCount) {
        break
      }
      // Exclusive, and at least one bucket past `fromBucket`, so every pixel draws something.
      const toBucket = Math.min(
        bucketCount,
        Math.max(
          fromBucket + 1,
          Math.floor(firstBucket + (pixel + 1) * bucketsPerPixel),
        ),
      )
      let lowest = 0
      let highest = 0
      for (let bucket = fromBucket; bucket < toBucket; bucket++) {
        lowest = Math.min(lowest, peaks.min[bucket])
        highest = Math.max(highest, peaks.max[bucket])
      }
      // Samples run -1 to 1, with 1 at the top.
      const top = middle - highest * middle
      const bottom = middle - lowest * middle
      context.fillRect(pixel, top, 1, Math.max(1, bottom - top))
    }
  }, [peaks, startTime, pixelsPerSecond, width, height, color])

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute top-1 block h-[calc(100%-0.5rem)]"
      style={{ left, width }}
    />
  )
}
