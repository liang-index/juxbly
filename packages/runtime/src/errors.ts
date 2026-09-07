/**
 * Failure classification for the run engine (stage 1-7).
 *
 * The engine translates, it does not pass through: a capability's own `message` is never
 * forwarded, because that text can be built from page content (a selector, a value) and
 * `RunOutcome` crosses into the panel and into storage. What travels is the stable
 * `code` — 1-9 / 1-10 map it to a copy key, exactly as they do for the llm error
 * categories (§5.5). The message below is for a developer reading a log, not for a user.
 */
import type { RunErrorCode } from '@juxbly/core'

/** Thrown by the engine itself: an abort, or a step type nothing implements. */
export class StepFailure extends Error {
  readonly code: RunErrorCode
  readonly step: number | undefined

  constructor(code: RunErrorCode, message: string, step?: number) {
    super(message)
    this.name = 'StepFailure'
    this.code = code
    this.step = step
  }
}

export interface ClassifiedFailure {
  code: RunErrorCode
  message: string
  /** A cancelled run: nothing is stored and nothing is reported as broken. */
  aborted: boolean
  /** Which step failed, when the failure belongs to one. */
  step?: number
  /** Kept from `ExtractError` so health can name the selector that failed. */
  selector?: string
}

const EXTRACT_CODES: readonly string[] = ['SELECTOR_SYNTAX', 'CONTAINER_MISSING', 'DOM_UNAVAILABLE']
const VARIABLE_CODES: readonly string[] = [
  'VARIABLE_DUPLICATE',
  'VARIABLE_UNRESOLVED',
  'VARIABLE_NOT_RECORDS',
]
const ENGINE_CODES: readonly string[] = [
  'LLM_FAILED',
  'VALIDATION_FAILED',
  'CAPABILITY_UNREGISTERED',
  'CAPABILITY_FAILED',
]

const MESSAGES: Record<RunErrorCode, string> = {
  SELECTOR_SYNTAX: 'the selector could not be parsed',
  CONTAINER_MISSING: 'the container selector matched nothing',
  DOM_UNAVAILABLE: 'the DOM port was not available in this context',
  ABORTED: 'the run was cancelled',
  LLM_FAILED: 'the model call failed',
  VALIDATION_FAILED: 'the tool definition is not valid',
  CAPABILITY_UNREGISTERED: 'no capability is registered for this step type',
  CAPABILITY_FAILED: 'a capability refused to run or threw',
  VARIABLE_DUPLICATE: 'two steps produce the same variable',
  VARIABLE_UNRESOLVED: 'a step reads a variable no earlier step produced',
  VARIABLE_NOT_RECORDS: 'a step reads a variable that is not a list of records',
}

export function classifyFailure(error: unknown, step: number | undefined): ClassifiedFailure {
  const code = readString(error, 'code')
  const failureStep = error instanceof StepFailure ? (error.step ?? step) : step

  if (code === 'ABORTED') return done('ABORTED', true, failureStep)
  if (code === undefined) return done('CAPABILITY_FAILED', false, failureStep)

  if (EXTRACT_CODES.includes(code)) {
    const selector = readString(error, 'selector')
    return {
      ...done(code as RunErrorCode, false, failureStep),
      ...(selector === undefined ? {} : { selector }),
    }
  }
  if (VARIABLE_CODES.includes(code) || ENGINE_CODES.includes(code)) {
    return done(code as RunErrorCode, false, failureStep)
  }

  // An unknown code still becomes a known one: the panel can only branch on what it knows.
  return done('CAPABILITY_FAILED', false, failureStep)
}

function done(code: RunErrorCode, aborted: boolean, step: number | undefined): ClassifiedFailure {
  return { code, message: MESSAGES[code], aborted, ...(step === undefined ? {} : { step }) }
}

/**
 * Errors are read structurally rather than by `instanceof`: the engine must not import
 * the capability packages, or the run engine would depend on the very things it
 * dispatches to (§4).
 */
function readString(error: unknown, key: string): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}
