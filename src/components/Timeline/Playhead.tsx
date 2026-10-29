import { useRef, useState, type KeyboardEvent } from 'react'

import { formatTime, parseTime } from '../../media'

// Room the time needs to the right of the line before it flips to the left, so it doesn't widen the scroll area.
const FLAG_WIDTH = 80

interface Props {
  time: number
  pixelsPerSecond: number
  /** The latest time you can type in. */
  max: number
  onSeek: (t: number) => void
}

/**
 * The vertical line marking the current playback position, flagged with the time on top.
 * Clicking the time lets you type one to jump to.
 */
export function Playhead({ time, pixelsPerSecond, max, onSeek }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const flip = (max - time) * pixelsPerSecond < FLAG_WIDTH

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancelled.current = true
      e.currentTarget.blur()
    }
  }

  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-3 w-0 -translate-x-px border-l-2 border-accent"
      style={{ left: time * pixelsPerSecond }}
    >
      {/* Always the same field, so it looks the same whether you're typing in it or not. */}
      <input
        className={`pointer-events-auto absolute top-0 field-sizing-content min-w-[8ch] cursor-text bg-accent px-1.5 py-0.5 font-mono text-2xs font-semibold whitespace-nowrap text-[#1a1206] tabular-nums outline-none not-supports-[field-sizing:content]:w-20 selection:bg-[#1a1206]/20 ${flip ? 'right-0.5 rounded-l-sm' : 'left-0 rounded-r-sm'}`}
        aria-label="Playhead time"
        title="Click to type a time"
        data-testid="clock"
        value={draft ?? formatTime(time)}
        // Keep the timeline from scrubbing under the field.
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={(e) => {
          setDraft(formatTime(time))
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          const t = draft === null ? null : parseTime(draft)
          if (!cancelled.current && t !== null) onSeek(Math.min(t, max))
          cancelled.current = false
          setDraft(null)
        }}
      />
    </div>
  )
}
