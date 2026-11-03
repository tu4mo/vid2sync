type Props = {
  /** File types the chooser offers, as for `<input accept>`. */
  accept: string
  /** What to drop, e.g. "a video and an audio file". */
  what: string
  onImport: (files: File[]) => void
}

/** "Import or drop …", where Import opens a file chooser. */
export function ImportPrompt({ accept, what, onImport }: Props) {
  return (
    <span className="text-sm text-dim">
      <label
        className="pointer-events-auto cursor-pointer text-accent hover:underline"
        // Keep the timeline from scrubbing (and deselecting) under the link.
        onPointerDown={(e) => e.stopPropagation()}
      >
        Import
        <input
          className="hidden"
          type="file"
          accept={accept}
          multiple
          onChange={(e) => {
            onImport([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </label>{' '}
      or drop {what}
    </span>
  )
}
