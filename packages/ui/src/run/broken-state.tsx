import type { ReactNode } from 'react'
import { t } from '../copy'
import type { RunHealthVerdict } from './ports'

/**
 * The broken state — `docs/UI_SPEC.md` §7 (stage 1-11).
 *
 * Broken is the one health state allowed the full error visual: the tool cannot read
 * the page at all, and pretending otherwise would be the worst kind of lie. The copy
 * rule is the error rule (§9 rule 2): one sentence of what happened, then a direction —
 * the repair CTA. The CTA is wired by the host; 1-12 fills it with the repair flow, and
 * until then the retry link keeps the state honest without promising a fix that does
 * not exist yet (`task/stage-1-11.md` Do Not Implement: no repair in 1-11).
 */
export interface BrokenStateProps {
  health: RunHealthVerdict
  onRepair?: (() => void) | undefined
  onRefresh(): void
}

export function BrokenState({ health, onRepair, onRefresh }: BrokenStateProps): ReactNode {
  return (
    <div className="jx-run-state jx-run-state--broken" role="alert">
      <p className="jx-run-state-line">{t('run.health.broken')}</p>
      <p className="jx-health-line">{health.reason}</p>
      {onRepair === undefined ? null : (
        <button type="button" className="jx-chip" onClick={onRepair}>
          {t('run.health.repair')}
        </button>
      )}
      <button type="button" className="jx-link" onClick={onRefresh}>
        {t('run.health.retry')}
      </button>
    </div>
  )
}
