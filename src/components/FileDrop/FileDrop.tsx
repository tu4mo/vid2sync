import { useState, type ReactNode } from 'react'

type Props = {
  className?: string
  /** Shown over the contents while something is dragged over them. */
  label: string
  children: ReactNode
  /** Called with the dropped files, which may be none, and the element they were dropped on. */
  onDrop: (files: File[], target: Element) => void
}

/** Takes files dropped anywhere on it, with an overlay while dragging. */
export function FileDrop({ className, label, children, onDrop }: Props) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={`relative ${className ?? ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) {
          setDragging(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onDrop([...e.dataTransfer.files], e.target as Element)
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-bg/70 text-lg font-semibold text-accent">
          {label}
        </div>
      )}
      {children}
    </div>
  )
}
