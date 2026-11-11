/** A thrown value's message, for showing in the error dialog. */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
