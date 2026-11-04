/** A thrown value's message, for showing in the error dialog. */
export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}
