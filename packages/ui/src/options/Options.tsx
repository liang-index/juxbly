import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ToolOverviewItem, UsageStats } from '@juxbly/core'
import { t } from '../copy'
import { FeedbackEntry } from '../feedback/feedback-entry'
import { relativeTime } from '../run/result-header'
import type { ManagePorts } from './ports'
import { ByokForm } from './byok-form'
import { VersionBadge } from './version-badge'
import type { SettingsPorts } from './ports'

/**
 * The options page — `task/stage-1-13.md` Scope 4 / 5, `docs/UI_SPEC.md` §7.2 / §7.4.
 *
 * Three sections, and a deliberate absence. Model access and the floating-ball switch are
 * configuration; the usage block is the three honest numbers plus the line that makes
 * "zero telemetry" a visible promise rather than a private virtue (§7.4). What is *not*
 * here is any notion of a tool being quiet or archived (C1): a tool is listed or it has
 * been removed, and removal is the one exit, confirmed twice.
 *
 * Stage 1-16 appends two things at the foot, both about the same idea — a person who
 * wants to report something needs to be able to say *which build* it was, and needs
 * somewhere to put it. The version is a label, not a brand; the feedback entry attaches
 * nothing on its own.
 */
export interface OptionsProps {
  settings: SettingsPorts
  manage: ManagePorts
  /** Injected so relative times are a pure function of two numbers in tests. */
  now?: number | undefined
  /** The extension's manifest version; the badge names it so a report can too. */
  version?: string
  /** Optional: without it the diagnostic line is shown for the user to copy by hand. */
  clipboard?: { writeText(text: string): Promise<void> }
}

export function Options({ settings, manage, now, version, clipboard }: OptionsProps): ReactNode {
  return (
    <main className="jx-options">
      <h1 className="jx-options-title">{t('options.heading')}</h1>
      <ByokForm ports={settings} />
      <BallToggle ports={settings} />
      <UsagePanel manage={manage} now={now} />
      {version === undefined ? null : <VersionBadge version={version} />}
      {version === undefined ? null : (
        <FeedbackEntry
          version={version}
          {...(clipboard === undefined ? {} : { copy: (text) => clipboard.writeText(text) })}
        />
      )}
    </main>
  )
}

export function BallToggle({ ports }: { ports: SettingsPorts }): ReactNode {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    let live = true
    void ports
      .load()
      .then((view) => {
        if (live) setEnabled(view.floating_ball_enabled)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [ports])

  const change = (next: boolean): void => {
    setEnabled(next)
    void ports.save({ floating_ball_enabled: next })
  }

  return (
    <section className="jx-options-section">
      <h2 className="jx-options-heading">{t('options.ball.label')}</h2>
      <label className="jx-options-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => change(event.target.checked)}
        />
        <span>{t('options.ball.label')}</span>
      </label>
      <p className="jx-options-note">{t('options.ball.hint')}</p>
    </section>
  )
}

export interface UsagePanelProps {
  manage: ManagePorts
  now?: number | undefined
}

/**
 * The three numbers and the list they describe.
 *
 * `stats:get` and `tool:list` are two messages rather than one on purpose: the numbers
 * survive a removed tool (the count of runs happened), while the list must not show a
 * removed tool. Sharing one reply would make one of the two wrong after a delete.
 */
export function UsagePanel({ manage, now }: UsagePanelProps): ReactNode {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [tools, setTools] = useState<readonly ToolOverviewItem[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const clock = now ?? Date.now()

  useEffect(() => {
    let live = true
    const refresh = (): void => {
      void manage
        .listTools()
        .then((rows) => {
          if (live) setTools(rows)
        })
        .catch(() => {
          if (live) setFailed(true)
        })
    }
    void manage
      .stats()
      .then((value) => {
        if (live) setStats(value)
      })
      .catch(() => {})
    refresh()
    return () => {
      live = false
    }
  }, [manage])

  const remove = (toolId: string): void => {
    setConfirming(null)
    void manage.deleteTool(toolId).then((ok) => {
      if (!ok) {
        setFailed(true)
        return
      }
      // A removed tool leaves the list at once; the stats numbers follow on their own
      // reload, because the runs it counted still happened.
      void manage
        .listTools()
        .then(setTools)
        .catch(() => setFailed(true))
    })
  }

  return (
    <section className="jx-options-section">
      <h2 className="jx-options-heading">{t('options.stats.heading')}</h2>

      <dl className="jx-options-stats">
        <div>
          <dt>{t('options.stats.tools')}</dt>
          <dd>{stats === null ? '—' : stats.totalTools}</dd>
        </div>
        <div>
          <dt>{t('options.stats.added_this_week')}</dt>
          <dd>{stats === null ? '—' : stats.addedThisWeek}</dd>
        </div>
        <div>
          <dt>{t('options.stats.total_runs')}</dt>
          <dd>{stats === null ? '—' : stats.totalRuns}</dd>
        </div>
      </dl>
      <p className="jx-options-note">{t('options.stats.privacy')}</p>

      <h3 className="jx-options-heading">{t('options.manage.heading')}</h3>
      {tools.length === 0 ? (
        <p className="jx-options-note">{t('options.manage.empty')}</p>
      ) : (
        <ul className="jx-options-list">
          {tools.map((tool) => (
            <li key={tool.toolId} className="jx-options-row">
              <span className="jx-options-row-main">
                <span className="jx-options-row-name">{tool.name}</span>
                <span className="jx-options-row-meta">
                  {tool.domain}
                  <span className="jx-popup-sep">·</span>
                  {tool.lastUsedAt === null
                    ? t('popup.never_used')
                    : relativeTime(tool.lastUsedAt, clock)}
                </span>
              </span>
              {confirming === tool.toolId ? (
                <span className="jx-options-confirm">
                  <span>{t('options.manage.confirm')}</span>
                  <button
                    type="button"
                    className="jx-options-danger"
                    onClick={() => remove(tool.toolId)}
                  >
                    {t('options.manage.confirm_ok')}
                  </button>
                  <button
                    type="button"
                    className="jx-options-secondary"
                    onClick={() => setConfirming(null)}
                  >
                    {t('options.manage.cancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="jx-options-secondary"
                  aria-label={t('options.manage.delete_aria')}
                  onClick={() => setConfirming(tool.toolId)}
                >
                  {t('options.manage.delete')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {failed ? <p className="jx-options-result jx-options-result--error">{t('options.manage.delete_failed')}</p> : null}
    </section>
  )
}
