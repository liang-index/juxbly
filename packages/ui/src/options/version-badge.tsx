import { t } from '../copy'
import type { ReactNode } from 'react'

/**
 * The version identity — `task/stage-1-16.md` Scope 5.
 *
 * It exists for one reason: a bug report or a rollback story has to be able to name the
 * build it happened on. That is also why it is *small* — a paragraph in `text-meta` at
 * the foot of the settings page, with no logo, no link and no heading. A brand slot
 * would be a different feature wearing this one's clothes, and the test asserts the
 * difference structurally rather than trusting the wording.
 */
export interface VersionBadgeProps {
  /** The extension's manifest version, e.g. "0.4.2". */
  version: string
}

export function VersionBadge({ version }: VersionBadgeProps): ReactNode {
  return (
    <p className="jx-options-version" data-role="version">
      {t('options.version.badge', { version })}
    </p>
  )
}
