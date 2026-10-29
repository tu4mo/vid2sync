import { useEffect, useRef } from 'react'

import { Button } from '../Button/Button'

type Props = {
  message: string | null
  onClose: () => void
}

/** A modal for errors; OK, Esc and the backdrop all close it. */
export function ErrorDialog({ message, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    if (message && !el.open) {
      el.showModal()
    } else if (!message && el.open) {
      el.close()
    }
  }, [message])

  return (
    <dialog
      ref={ref}
      className="m-auto max-w-md rounded-xl border border-line bg-panel text-fg shadow-2xl backdrop:bg-black/60"
      onClose={onClose}
      // The contents fill the dialog, so a click on the dialog element itself is a click on the backdrop.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div className="p-5">
        <h2 className="mb-2 font-semibold text-danger">Something went wrong</h2>
        <p className="mb-4 select-text">{message}</p>
        <form method="dialog" className="flex justify-end">
          <Button type="submit" autoFocus>
            OK
          </Button>
        </form>
      </div>
    </dialog>
  )
}
