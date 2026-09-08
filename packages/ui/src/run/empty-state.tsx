import type { ReactNode } from 'react'
import { t } from '../copy'

/**
 * 0 rows — `docs/UI_SPEC.md` §7.
 *
 * An empty result is an answer the tool is allowed to give, so this is guidance copy in
 * muted colour: no error class, no warning, no apology. Rendering "nothing matched" as a
 * failure is the fastest way to make a working tool look broken.
 */
export function EmptyState(): ReactNode {
  return (
    <div className="jx-run-state">
      <p className="jx-run-state-line">{t('run.empty')}</p>
      <p className="jx-run-state-hint">{t('run.empty_hint')}</p>
    </div>
  )
}
