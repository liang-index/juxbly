/**
 * Error categories for BYOK calls.
 *
 * Why a category and not a message: the panel has to tell "your key is wrong" from
 * "the endpoint is down" from "you are out of quota" — three different next actions
 * (`docs/ARCHITECTURE.md` §11, `docs/UI_SPEC.md` §9 rule 2: error copy always points at
 * a next step). The codes are part of the contract: renaming one means updating
 * §5.5 and every consumer (1-9 / 1-10 / 1-13).
 *
 * The `message` texts below are the diagnostic reading of the code, not shipped UI
 * copy: the panels map a code to a `packages/ui/src/copy/` key (UI_SPEC §9.5).
 */
export type LlmErrorCode =
  /** No key / model configured yet — 1-13's onboarding step takes over from here. */
  | 'NOT_CONFIGURED'
  /** Endpoint unreachable, DNS failure, connection reset. */
  | 'NETWORK'
  /** 401 / 403. */
  | 'AUTH'
  /** 429 — a distinct copy path from NETWORK (§11: quota vs connection). */
  | 'RATE_LIMIT'
  /** Any other non-2xx status. */
  | 'HTTP_ERROR'
  /** The deadline passed. */
  | 'TIMEOUT'
  /** Cancelled by the caller (panel closed / page navigated). */
  | 'ABORTED'
  /** The step itself cannot be sent (a custom task with no instruction). */
  | 'INVALID_REQUEST'
  /** The endpoint replied with something that is not a readable chat completion. */
  | 'INVALID_RESPONSE'

/** Every category, for tests and for anything that has to enumerate the surface. */
export const LLM_ERROR_CODES: readonly LlmErrorCode[] = [
  'NOT_CONFIGURED',
  'NETWORK',
  'AUTH',
  'RATE_LIMIT',
  'HTTP_ERROR',
  'TIMEOUT',
  'ABORTED',
  'INVALID_REQUEST',
  'INVALID_RESPONSE',
]

export interface LlmErrorOptions {
  status?: number
  cause?: unknown
}

export class LlmError extends Error {
  readonly code: LlmErrorCode
  /** HTTP status when the failure came from one; absent otherwise. */
  readonly status?: number

  constructor(code: LlmErrorCode, message: string, options: LlmErrorOptions = {}) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    if (options.status !== undefined) this.status = options.status
    if (options.cause !== undefined) {
      // `cause` on Error is ES2022 and always assignable; kept out of the constructor
      // object spread so the option stays optional for callers.
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

const MESSAGES: Record<LlmErrorCode, string> = {
  NOT_CONFIGURED: 'No model endpoint is configured yet.',
  NETWORK: 'The model endpoint could not be reached.',
  AUTH: 'The model endpoint rejected the API key.',
  RATE_LIMIT: 'The model endpoint is rate limiting this key.',
  HTTP_ERROR: 'The model endpoint returned an error.',
  TIMEOUT: 'The model did not answer in time.',
  ABORTED: 'The request was cancelled.',
  INVALID_REQUEST: 'The llm step has nothing to send.',
  INVALID_RESPONSE: 'The model response could not be read.',
}

/** The diagnostic wording for a code — one place, so the same category never reads twice. */
export function llmErrorMessage(code: LlmErrorCode): string {
  return MESSAGES[code]
}

export function createLlmError(code: LlmErrorCode, options: LlmErrorOptions = {}): LlmError {
  return new LlmError(code, llmErrorMessage(code), options)
}

export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError
}

/** The category of any thrown value; `INVALID_RESPONSE` is never a safe default. */
export function llmErrorCodeOf(error: unknown): LlmErrorCode | null {
  return isLlmError(error) ? error.code : null
}
