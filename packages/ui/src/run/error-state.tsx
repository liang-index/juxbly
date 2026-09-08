import type { RunError, ValidationError } from '@juxbly/core'
import type { ReactNode } from 'react'
import { t } from '../copy'

/**
 * The error state — `docs/UI_SPEC.md` §7 / §9 rule 2.
 *
 * Error copy always points at a next step, so every branch ends in the refresh entry. The
 * validation branch is the one that can say *where* it broke: the engine already produced
 * field-level reasons (§5.4), and hiding them behind "something went wrong" would send the
 * user to re-describe a tool that only has a bad selector.
 */
export interface ErrorStateProps {
  error: RunError | null
  onRefresh(): void
}

export function ErrorState({ error, onRefresh }: ErrorStateProps): ReactNode {
  const reasons = fieldReasons(error)

  return (
    <div className="jx-run-state jx-run-state--error">
      <p className="jx-run-state-line">{copyFor(error?.code)}</p>
      {reasons.length === 0 ? null : (
        <ul className="jx-run-reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <button type="button" className="jx-link" onClick={onRefresh}>
        {t('run.error_next')}
      </button>
    </div>
  )
}

/** English and stable by contract (§5.4) — safe to show as-is, never to translate ad hoc. */
function fieldReasons(error: RunError | null): string[] {
  return (error?.errors ?? []).map((candidate: ValidationError) => candidate.message)
}

function copyFor(code: string | undefined): string {
  if (code === 'LLM_FAILED' || code === 'NOT_CONFIGURED') return t('run.error_llm')
  if (code === 'VALIDATION_FAILED') return t('run.error_validation')
  return t('run.error')
}
