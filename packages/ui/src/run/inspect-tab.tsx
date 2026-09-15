import type { RunStepTrace } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { useState, type ReactNode } from 'react'
import { t } from '../copy'
import { stepViews, type StepView } from './inspect-steps'

/**
 * The runtime inspector — `task/stage-1-16.md` Scope 3, `docs/UI_SPEC.md` §10.
 *
 * The build stage has its own inspector (1-9) for the page analysis; this one is for a
 * tool that has already run: which steps ran, what each was handed, what it wrote and
 * how long it took. `font-mono` is allowed here and almost nowhere else (§3).
 *
 * One rule from the task file that shapes the markup: **none of this reaches a log.**
 * The values are page content and are shown only because a person opened this tab to
 * look at them, in a panel that is never persisted (§12.1 debug-first, §13 zero
 * telemetry).
 */
export interface InspectTabProps {
  tool: ToolDefinition
  trace: readonly RunStepTrace[] | null
  outputs: Readonly<Record<string, unknown>> | null
}

export function InspectTab({ tool, trace, outputs }: InspectTabProps): ReactNode {
  const views = stepViews(tool, trace, outputs)
  const [selected, setSelected] = useState(0)
  const active = views[selected] ?? null

  // No separate empty state on purpose: the definition always has steps (validation
  // forbids an empty list, §5.4 rule 1), so the pipeline *is* the content — a step
  // that has not run is marked "not reached" rather than dropped or blanked.
  if (active === null) {
    return <p className="jx-inspect-empty">{t('run.inspect.empty')}</p>
  }

  return (
    <div className="jx-inspect-tab">
      <ol className="jx-steps" aria-label={t('run.tab.inspect')}>
        {views.map((view) => (
          <li key={view.index}>
            <button
              type="button"
              className={view.index === selected ? 'jx-step is-active' : 'jx-step'}
              aria-pressed={view.index === selected}
              data-testid={`step-${view.index}`}
              onClick={() => setSelected(view.index)}
            >
              <span className="jx-step-type">{view.type}</span>
              <span className="jx-step-time">{t('run.inspect.ms', { ms: view.durationMs })}</span>
            </button>
          </li>
        ))}
      </ol>
      <StepDetail view={active} />
    </div>
  )
}

function StepDetail({ view }: { view: StepView }): ReactNode {
  return (
    <div className="jx-step-detail" data-testid="step-detail">
      <p className="jx-inspect-row">
        <span className="jx-inspect-label">{t('run.inspect.input')}</span>
        {view.input === null ? (
          <span className="jx-inspect-value">{t('run.inspect.page')}</span>
        ) : (
          <pre className="jx-out">{view.input}</pre>
        )}
        {view.inputHidden === 0 ? null : (
          <span className="jx-inspect-more">
            {t('run.inspect.truncated', { count: view.inputHidden })}
          </span>
        )}
      </p>

      <p className="jx-inspect-row">
        <span className="jx-inspect-label">{t('run.inspect.output')}</span>
        {view.output === null ? null : <pre className="jx-out">{view.output}</pre>}
      </p>
      {view.outputHidden === 0 ? null : (
        <span className="jx-inspect-more">
          {t('run.inspect.truncated', { count: view.outputHidden })}
        </span>
      )}

      <p className="jx-inspect-row">
        <span className="jx-inspect-label">{t('run.inspect.duration')}</span>
        <span className="jx-inspect-value">{t('run.inspect.ms', { ms: view.durationMs })}</span>
      </p>

      {view.cached ? <p className="jx-inspect-note">{t('run.inspect.cached')}</p> : null}
      {!view.ran ? <p className="jx-inspect-note">{t('run.inspect.skipped')}</p> : null}
      {view.error === null ? null : (
        <p className="jx-inspect-note jx-inspect-note--error">{view.error}</p>
      )}
    </div>
  )
}
