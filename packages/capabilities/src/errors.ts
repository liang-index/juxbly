/**
 * The error every capability throws when it refuses to run.
 *
 * Why a dedicated class: the run engine (1-7) has to tell "this step was rejected"
 * from "this step crashed", because the first is shown as a field-level reason and the
 * second as a failure. `code` is stable and English — the panel keys off it, and it is
 * never a message the user has to parse.
 */
export class CapabilityError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CapabilityError'
    this.code = code
  }
}
