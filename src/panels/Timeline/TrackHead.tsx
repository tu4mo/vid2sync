import { Slider } from '../../components/Slider/Slider'
import type { TrackKind } from '../../lib/media'

type Props = {
  kind: TrackKind
  muted: boolean
  volume: number
  loading: boolean
  onVolumeChange: (volume: number) => void
}

export function TrackHead({
  kind,
  muted,
  volume,
  loading,
  onVolumeChange,
}: Props) {
  const percent = Math.round(volume * 100)
  return (
    <div
      className="flex flex-col justify-center gap-[3px] px-2.5"
      data-track={kind}
      data-testid={`head-${kind}`}
    >
      {loading && <span className="truncate text-xs text-dim">Loading…</span>}
      <div className="flex items-center gap-1.5">
        <Slider
          className="min-w-0 flex-1"
          min={0}
          max={2}
          step={0.01}
          value={volume}
          disabled={muted}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          onDoubleClick={() => onVolumeChange(1)}
          title={`Volume ${percent}% (double-click to reset)`}
        />
        <span className="w-[34px] text-right text-2xs text-dim tabular-nums">
          {percent}%
        </span>
      </div>
    </div>
  )
}
