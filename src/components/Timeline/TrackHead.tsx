import type { Clip, TrackKind } from '../../media'
import { LANE_HEIGHT } from './layout'

const LABELS: Record<TrackKind, string> = { video: 'Video', audio: 'Audio' }
// Full class names, so Tailwind finds them in the source.
const HEAD_BORDERS: Record<TrackKind, string> = { video: 'border-l-video', audio: 'border-l-audio' }

interface Props {
  kind: TrackKind
  clip: Clip | null
  muted: boolean
  volume: number
  loading: boolean
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  onImport: (file: File) => void
  onRemove: () => void
}

export function TrackHead(props: Props) {
  const { kind, clip, muted, volume, loading, onToggleMute, onVolumeChange, onImport, onRemove } =
    props
  return (
    <div
      className={`flex flex-col justify-center gap-[3px] border-b border-l-3 border-b-line px-2.5 ${HEAD_BORDERS[kind]}`}
      data-track={kind}
      data-testid={`head-${kind}`}
      style={{ height: LANE_HEIGHT }}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-semibold">{LABELS[kind]}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-dim">{loading && 'Loading…'}</span>
        <button
          className="px-1.5 py-0 text-2xs font-bold aria-pressed:border-danger aria-pressed:bg-danger aria-pressed:text-white"
          aria-label="Mute"
          aria-pressed={muted}
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
        >
          M
        </button>
        {clip && (
          <button
            className="px-1.5 py-0 text-2xs font-bold enabled:hover:border-danger enabled:hover:text-danger"
            aria-label="Remove clip"
            onClick={onRemove}
            title="Remove clip (Delete)"
          >
            ×
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          className="h-3.5 min-w-0 flex-1 accent-accent"
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={volume}
          disabled={muted}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          onDoubleClick={() => onVolumeChange(1)}
          title={`Volume ${Math.round(volume * 100)}% (double-click to reset)`}
        />
        <span className="w-[34px] text-right text-2xs text-dim tabular-nums">
          {Math.round(volume * 100)}%
        </span>
      </div>
      <label className="cursor-pointer self-start text-xs text-accent">
        {clip ? 'Replace…' : 'Import…'}
        <input
          className="hidden"
          type="file"
          accept={`${kind}/*`}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImport(file)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}
