import { formatTime, type TimeRange } from '../../media'
import { Button } from '../Button/Button'
import { Slider } from '../Slider/Slider'
import { MAX_PPS, MIN_PPS } from '../Timeline/Timeline'

interface Props {
  playing: boolean
  time: number
  end: number
  range: TimeRange | null
  canExport: boolean
  exportProgress: number | null
  pps: number
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onExport: () => void
  onZoom: (pps: number) => void
}

export function Toolbar(props: Props) {
  const { playing, time, end, range, canExport, exportProgress, pps } = props
  const { onPlay, onPause, onSeek, onExport, onZoom } = props
  return (
    <div className="flex items-center gap-2.5 border-t border-line bg-panel px-4 py-2">
      <Button
        variant="primary"
        className="min-w-[70px]"
        onClick={playing ? onPause : onPlay}
        disabled={end === 0}
      >
        {playing ? 'Pause' : 'Play'}
      </Button>
      <Button onClick={() => onSeek(0)} title="Go to start">
        ⏮
      </Button>
      <span className="font-mono tabular-nums" data-testid="clock">
        {formatTime(time)} <span className="text-dim">/ {formatTime(end)}</span>
      </span>
      <span className="ml-auto font-mono text-xs whitespace-nowrap" data-testid="range">
        {range ? (
          <>
            {formatTime(range.start)} – {formatTime(range.end)}{' '}
            <span className="text-dim">({(range.end - range.start).toFixed(2)} s)</span>
          </>
        ) : (
          <span className="text-dim">Whole video</span>
        )}
      </span>
      <Button
        className="tabular-nums"
        onClick={onExport}
        disabled={!canExport || exportProgress !== null}
        title="Save the video with the synced audio as MP4"
      >
        {exportProgress === null ? 'Export MP4' : `Exporting… ${Math.round(exportProgress * 100)}%`}
      </Button>
      <label className="ml-3 flex items-center gap-2 text-dim">
        Zoom
        <Slider
          className="w-32"
          min={Math.log(MIN_PPS)}
          max={Math.log(MAX_PPS)}
          step={0.01}
          value={Math.log(pps)}
          onChange={(e) => onZoom(Math.exp(Number(e.target.value)))}
        />
      </label>
    </div>
  )
}
