import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ToolOverviewItem } from '@juxbly/core'
import type { ToolCategory } from '@juxbly/dsl'
import { t } from '../copy'
import { categoryColor } from '../run/category'
import { relativeTime } from '../run/result-header'
import type { OverviewPorts } from './ports'
import { overviewRows, statusColor, statusCopyKey } from './tool-list'

/**
 * The toolbar overview — `docs/UI_SPEC.md` §7.2, stage 1-13.
 *
 * What it is: a list of the tools this browser already has, most recently used first, with
 * a search box and one link to the README. What it is not: a management surface. There is
 * no delete and no edit here — removing a tool is a considered act and belongs on a page
 * where the consequences are visible (§7.2).
 *
 * Every row carries its state **in words**, not only as a coloured dot, and the host is
 * shown without the path: a full URL would be noise in a 320px popup and a browsing
 * detail the user did not ask to display.
 *
 * The site mark is a letter, not a favicon. Fetching one would mean asking a third party
 * about every domain the user owns a tool for, on every popup open — a direct answer to
 * "which sites does this person use", from a product that promises zero telemetry (§13).
 */

export interface PopupProps {
  ports: OverviewPorts
  /** Injected so the relative times are a pure function of two numbers in tests. */
  now?: number
  /** Where the help link points. */
  helpUrl: string
  /**
   * The settings page, relative to the popup itself.
   *
   * A relative href is deliberate: it resolves inside the extension's own origin without
   * the popup needing a `chrome.*` call, which keeps the toolbar surface inside the
   * boundary §6.4 sets (no platform API in an entrypoint that is not the background).
   */
  settingsUrl?: string
}

export function Popup({ ports, now, helpUrl, settingsUrl }: PopupProps): ReactNode {
  const [tools, setTools] = useState<readonly ToolOverviewItem[]>([])
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void ports
      .listTools()
      .then((rows) => {
        if (!live) return
        setTools(rows)
        setLoaded(true)
      })
      .catch(() => {
        if (!live) return
        setLoaded(true)
        setFailed(true)
      })
    return () => {
      live = false
    }
  }, [ports])

  const rows = overviewRows(tools, query)
  const clock = now ?? Date.now()

  const open = (tool: ToolOverviewItem): void => {
    void ports.openTab(tool.url).then((ok) => {
      if (!ok) setFailed(true)
    })
  }

  return (
    <div className="jx-popup">
      <div className="jx-popup-head">
        <h1 className="jx-popup-title">{t('popup.heading')}</h1>
      </div>

      <input
        className="jx-popup-search"
        type="search"
        value={query}
        placeholder={t('popup.search')}
        aria-label={t('popup.search_aria')}
        onChange={(event) => setQuery(event.target.value)}
      />

      {rows.length === 0 ? (
        <p className="jx-popup-empty">
          {!loaded ? t('views.loading') : query.trim() === '' ? emptyCopy(failed) : t('popup.empty_filtered')}
        </p>
      ) : (
        <ul className="jx-popup-list">
          {rows.map((tool) => (
            <li key={tool.toolId}>
              <button
                type="button"
                className="jx-popup-row"
                onClick={() => open(tool)}
                aria-label={`${tool.name} — ${tool.domain}`}
              >
                <SiteMark domain={tool.domain} category={tool.category} />
                <span className="jx-popup-row-main">
                  <span className="jx-popup-row-name">{tool.name}</span>
                  <span className="jx-popup-row-meta">
                    {tool.domain}
                    <span className="jx-popup-sep">·</span>
                    {tool.lastUsedAt === null
                      ? t('popup.never_used')
                      : relativeTime(tool.lastUsedAt, clock)}
                  </span>
                </span>
                <span className="jx-popup-row-state">
                  <span
                    className="jx-popup-dot"
                    style={{ background: statusColor(tool.status) }}
                    aria-hidden="true"
                  />
                  <span className="jx-popup-status">{t(statusCopyKey(tool.status))}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="jx-popup-foot">
        <a className="jx-popup-help" href={helpUrl} target="_blank" rel="noreferrer noopener">
          {t('popup.help')}
        </a>
        {settingsUrl === undefined ? null : (
          <a
            className="jx-popup-help"
            href={settingsUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t('popup.settings_aria')}
          >
            {t('popup.settings')}
          </a>
        )}
      </div>
    </div>
  )
}

/** A failed load says so rather than showing "no tools yet" — those are different states. */
function emptyCopy(failed: boolean): string {
  return failed ? t('popup.open_failed') : t('popup.empty')
}

export interface SiteMarkProps {
  domain: string
  category: ToolCategory
}

/**
 * The first letter of the host, on the tool's category colour.
 *
 * It is deliberately not a favicon request: see the note at the top of this file.
 */
export function SiteMark({ domain, category }: SiteMarkProps): ReactNode {
  return (
    <span
      className="jx-popup-mark"
      style={{ background: categoryColor(category) }}
      aria-hidden="true"
    >
      {initial(domain)}
    </span>
  )
}

function initial(domain: string): string {
  const host = domain.replace(/^www\./, '')
  return host.charAt(0).toUpperCase() === '' ? '?' : host.charAt(0).toUpperCase()
}
