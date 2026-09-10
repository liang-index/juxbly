import type { ToolVersionSummary } from '@juxbly/core'
import { useEffect, useState, type ReactNode } from 'react'
import { ENTRY_IDS } from '../commands/slash-commands'
import { t } from '../copy'
import { VersionList } from '../config/version-list'
import type { RunMessagingPorts, VersionHistory } from './ports'

/**
 * The config tab's version list — `task/stage-1-16.md` Scope 4 (C3), §8.1 / §9.3.
 *
 * The component landed in 1-12 and nothing shipped reached it; this is the wiring. It
 * stays **a plain list behind a toggle**, not a version switcher: no timeline, no diff,
 * and no "was broken" badge — `ever_broken` is a recorded fact, and V1 draws nothing
 * for it.
 *
 * A rollback changes which definition is in effect and keeps every entry, so it is
 * itself undoable by rolling back again. That is why it needs no confirmation: nothing
 * is lost. The run that follows is the panel's way of showing what the restored version
 * does — the previous version's result on screen would be a claim about the wrong one.
 */
export interface VersionSectionProps {
  ports: Pick<RunMessagingPorts, 'loadVersions' | 'rollback'>
  toolId: string
  /** The version in effect right now, used until the list has been read. */
  activeVersion: number
  open: boolean
  onToggle(): void
  /** Fired after a rollback wrote — the caller re-reads the tool and runs it again. */
  onRolledBack(version: number): void
}

export function VersionSection({
  ports,
  toolId,
  activeVersion,
  open,
  onToggle,
  onRolledBack,
}: VersionSectionProps): ReactNode {
  const [history, setHistory] = useState<VersionHistory | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    void ports.loadVersions(toolId).then((next) => {
      if (live) setHistory(next)
    })
    return () => {
      live = false
    }
  }, [open, toolId, ports, activeVersion])

  const rollback = (version: number): void => {
    setBusy(true)
    setNote(null)
    void ports.rollback({ toolId, version }).then((reply) => {
      setBusy(false)
      if (!reply.ok) {
        setNote({ tone: 'error', text: t('run.config.rollback_failed') })
        return
      }
      const now = reply.version ?? version
      setNote({ tone: 'ok', text: t('run.config.rollback_done', { version: now }) })
      onRolledBack(now)
    })
  }

  return (
    <div className="jx-config-versions">
      <button
        type="button"
        className="jx-link"
        data-entry={ENTRY_IDS.versions}
        aria-expanded={open}
        onClick={onToggle}
      >
        {t('config.versions.heading')}
      </button>

      {!open ? null : (
        <VersionList
          versions={history?.versions ?? ([] as readonly ToolVersionSummary[])}
          activeVersion={history?.version ?? activeVersion}
          onRollback={rollback}
          disabled={busy}
        />
      )}

      {note === null ? null : (
        <p className="jx-config-feedback" data-tone={note.tone}>
          {note.text}
        </p>
      )}
    </div>
  )
}
