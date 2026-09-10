/**
 * Execution-layer health — `docs/ARCHITECTURE.md` §10.
 *
 * The only layer that can take a tool straight to `broken`, and therefore the one that
 * must be narrow. Two of the four `ExtractErrorCode` values are deliberately **not**
 * failures:
 *
 * - `ABORTED` — the user closed the panel or the page navigated. Nothing was measured, so
 *   nothing can be concluded; a cancelled run must not leave the tool looking broken.
 * - `DOM_UNAVAILABLE` — the page context went away. That is the environment, not the tool,
 *   and the tool will be judged again on the next real run.
 *
 * Matching nothing is also not a failure: "nothing matched" is an answer a tool is
 * allowed to give (`docs/UI_SPEC.md` §7). It belongs to the result layer, which can see
 * whether the tool *used to* find things.
 */
import type { ExtractError, ExtractErrorCode } from '@juxbly/core'
import type { ExecutionLayer } from './types'

const BROKEN_CODES: readonly ExtractErrorCode[] = ['SELECTOR_SYNTAX', 'CONTAINER_MISSING']

export function judgeExecution(error: ExtractError | null | undefined): ExecutionLayer {
  if (error === null || error === undefined) return 'ok'
  return BROKEN_CODES.includes(error.code) ? 'failed' : 'ok'
}
