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

/**
 * No tool matched this page at all — a different answer from a tool that ran and found
 * nothing. The one way this state is ever *seen* is right after a save whose URL pattern
 * points somewhere else: the post-save mount reveals the panel, and silence would read as
 * the save having failed. So the line names what happened and where the tool does work,
 * without an error colour — the tool itself is fine.
 */
export function NoToolState(): ReactNode {
  return (
    <div className="jx-run-state">
      <p className="jx-run-state-line">{t('run.no_tool')}</p>
      <p className="jx-run-state-hint">{t('run.no_tool_hint')}</p>
    </div>
  )
}
