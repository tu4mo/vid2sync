import { Button } from '../../../components/Button/Button'

type Props = {
  /** How far this button moves the selected clip, in ms; negative is earlier. */
  ms: number
  /** Whether there's a selected clip to nudge. */
  canNudge: boolean
  onNudge: (ms: number) => void
}

export function NudgeButton({ ms, canNudge, onNudge }: Props) {
  const label = `Move ${Math.abs(ms)} ms ${ms > 0 ? 'later' : 'earlier'}`
  return (
    <Button
      className="tabular-nums"
      aria-label={label}
      title={canNudge ? label : `${label} (select a clip first)`}
      onClick={() => onNudge(ms)}
      disabled={!canNudge}
    >
      {ms > 0 ? `+${ms}` : ms}
    </Button>
  )
}
