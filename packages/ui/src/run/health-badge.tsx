import type { TokenUsage } from '@juxbly/core'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { t } from '../copy'
import type { RunHealthVerdict } from './ports'

/**
 * The degraded badge — `docs/UI_SPEC.md` §7 (stage 1-11).
 *
 * Degraded is **light by design**: a corner "?" that opens the detail inline, never a
 * dialog, never a color that competes with a real error. The manual semantic check
 * ("check once") lives inside the detail, because it is the user choosing to spend
 * tokens on an explanation — offering it on the main surface would make the cheap
 * layer look insufficient and train users to burn tokens reflexively (§10).
 *
 * `healthy` renders nothing at all, and so does "no verdict yet" — to the user those
 * two are the same thing.
 */

export interface ManualCheckResult {
  pending: boolean
  ok?: boolean
  verdict?: 'ok' | 'suspicious'
  reason?: string
  usage?: TokenUsage
  error?: string
}

export interface HealthBadgeProps {
  health: RunHealthVerdict
  check: ManualCheckResult | null
  onCheck(): void
}

export function HealthBadge({ health, check, onCheck }: HealthBadgeProps): ReactNode {
  const [open, setOpen] = useState(false)

  return (
    <div className="jx-health">
      <button
        type="button"
        className="jx-health-q"
        aria-label={t('run.health.aria')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open ? (
        <div className="jx-health-detail" role="note">
          <p className="jx-health-line">{health.reason}</p>
          {check === null ? null : <CheckLine check={check} />}
          <button
            type="button"
            className="jx-link"
            disabled={check?.pending === true}
            onClick={onCheck}
          >
            {check?.pending === true ? t('run.health.checking') : t('run.health.check')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function CheckLine({ check }: { check: ManualCheckResult }): ReactNode {
  if (check.pending) return null

  if (check.ok !== true) {
    // A failed check is "no answer", never a verdict — and it changed nothing (§10).
    return <p className="jx-health-line">{t('run.health.check_failed')}</p>
  }

  return (
    <p className="jx-health-line">
      <span className="jx-health-label">{t('run.health.last_check')}</span>
      {check.verdict === 'suspicious' ? t('run.health.check_suspicious') : t('run.health.check_ok')}
      {check.reason === undefined ? null : ` ${check.reason}`}
      {check.usage === undefined
        ? null
        : ` (${check.usage.prompt_tokens + check.usage.completion_tokens} ${t('run.health.tokens')})`}
    </p>
  )
}
