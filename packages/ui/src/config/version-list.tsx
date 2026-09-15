import type { ToolVersionSummary } from '@juxbly/core'
import type { ReactNode } from 'react'
import { t } from '../copy'

/**
 * The version list — `docs/ARCHITECTURE.md` §8.1 / §9.3, `task/stage-1-12.md` Scope 4,
 * C3: **a plain list, not a version switcher.** No timeline, no diff view, and no "was
 * broken" badge — `ToolVersion.ever_broken` is recorded because it is a fact, and V1
 * deliberately draws nothing for it.
 *
 * Rollback changes which definition is in effect and leaves `versions[]` — including the
 * entry currently in effect — untouched, so a rollback is itself undoable by rolling back
 * again. That is why the action is a secondary button here rather than a confirmed
 * destructive one: nothing is lost.
 *
 * The list is newest-first: the version someone is looking for after a repair is the one
 * before it, and "v1" is the one they only reach for when everything since went wrong.
 *
 * The prop type is the *summary* (`ToolVersionSummary`), not `ToolVersion`: a rollback is
 * done by number in the background, so the list never needs a definition, and the narrower
 * type is what crosses the message boundary (§7.2 `tool:get`). `ToolVersion` is assignable
 * to it, so a caller holding full versions needs no cast.
 */
export interface VersionListProps {
  versions: readonly ToolVersionSummary[]
  /** The version currently in effect — the one that needs no action. */
  activeVersion: number
  onRollback(version: number): void
  disabled?: boolean
}

export function VersionList({
  versions,
  activeVersion,
  onRollback,
  disabled,
}: VersionListProps): ReactNode {
  if (versions.length === 0) {
    // §7: a list with no data shows guidance, never a blank area.
    return <p className="jx-versions-empty">{t('config.versions.empty')}</p>
  }

  return (
    <ul className="jx-versions">
      {[...versions]
        .sort((left, right) => right.version - left.version)
        .map((version) => {
          const current = version.version === activeVersion
          return (
            <li className="jx-version" key={version.version} data-current={current}>
              <span className="jx-version-name">{`v${version.version}`}</span>
              <span className="jx-version-note">{version.note}</span>
              {/* A date, not a relative time: no locale formatting exists yet (4-5). */}
              <span className="jx-version-date">{version.created_at.slice(0, 10)}</span>
              {current ? (
                <span className="jx-version-current">{t('config.versions.current')}</span>
              ) : (
                <button
                  type="button"
                  className="jx-link"
                  aria-label={`${t('config.versions.rollback_aria')} ${version.version}`}
                  disabled={disabled === true}
                  onClick={() => onRollback(version.version)}
                >
                  {t('config.versions.rollback')}
                </button>
              )}
            </li>
          )
        })}
    </ul>
  )
}
