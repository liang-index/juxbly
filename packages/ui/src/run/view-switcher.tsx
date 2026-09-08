import type { ReactNode } from 'react'
import { t } from '../copy'
import type { ViewName } from '../views'

/**
 * Table / card / plain text — `docs/UI_SPEC.md` §7.1.
 *
 * Switching is a **local re-render of the same data**: no extract, no llm, no engine call.
 * The cost model of a tool a user opens every day depends on that, so the switcher has no
 * path back to the session's run method — it only sets a view.
 */
export interface ViewSwitcherProps {
  view: ViewName
  onChange(view: ViewName): void
}

const VIEWS: readonly { name: ViewName; label: string }[] = [
  { name: 'table', label: t('run.view.table') },
  { name: 'card', label: t('run.view.card') },
  { name: 'text', label: t('run.view.text') },
]

export function ViewSwitcher({ view, onChange }: ViewSwitcherProps): ReactNode {
  return (
    <div className="jx-run-views" role="group" aria-label={t('run.aria.view')}>
      {VIEWS.map((candidate) => (
        <button
          key={candidate.name}
          type="button"
          className={candidate.name === view ? 'jx-tab is-active' : 'jx-tab'}
          aria-pressed={candidate.name === view}
          onClick={() => onChange(candidate.name)}
        >
          {candidate.label}
        </button>
      ))}
    </div>
  )
}
