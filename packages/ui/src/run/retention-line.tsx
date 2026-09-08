import { useState, type ReactNode } from 'react'
import { t } from '../copy'

/**
 * The retention line — `docs/UI_SPEC.md` §7.3 segment ⑤.
 *
 * Retention happens by default, so this is not a choice the user makes: it is a fact
 * ("saved") plus an undo. The undo asks once more before it deletes — §7 forbids direct
 * deletion, and V1 has no archive tier, so removing the tool removes it completely.
 */
export interface RetentionLineProps {
  onDiscard(): void
}

export function RetentionLine({ onDiscard }: RetentionLineProps): ReactNode {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="jx-run-line jx-run-line--confirm">
        <span className="jx-run-meta">{t('run.discard.confirm')}</span>
        <span className="jx-run-meta">{t('run.discard.confirm_body')}</span>
        <button type="button" className="jx-link" onClick={onDiscard}>
          {t('run.discard.confirm_ok')}
        </button>
        <button type="button" className="jx-link" onClick={() => setConfirming(false)}>
          {t('run.discard.cancel')}
        </button>
      </div>
    )
  }

  return (
    <div className="jx-run-line">
      <span className="jx-run-meta">{t('run.saved')}</span>
      <button type="button" className="jx-link" onClick={() => setConfirming(true)}>
        {t('run.undo')}
      </button>
    </div>
  )
}
