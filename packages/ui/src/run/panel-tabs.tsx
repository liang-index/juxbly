import { t, type CopyKey } from '../copy'
import { ENTRY_IDS } from '../commands/slash-commands'
import type { ReactNode } from 'react'

/**
 * The run panel's three tabs — `docs/UI_SPEC.md` §10, `task/stage-1-16.md` Scope 1.
 *
 * One container, three views: the tab switches what is drawn, and nothing is unmounted
 * behind the switch. The result in particular stays mounted (hidden) because the render
 * capability draws into an element inside it — unmounting it mid-run would take the
 * mount point away from a run that is still going (§7.6).
 *
 * `data-entry` is the id a command names as its clickable equivalent. Result carries
 * none because no command opens it; the two that do carry one, and the panel's own test
 * asserts every id a command names is actually rendered here.
 */
export type RunTab = 'result' | 'config' | 'inspect'

interface TabSpec {
  id: RunTab
  label: CopyKey
  entry?: string
}

const TABS: readonly TabSpec[] = [
  { id: 'result', label: 'run.tab.result' },
  { id: 'config', label: 'run.tab.config', entry: ENTRY_IDS.config },
  { id: 'inspect', label: 'run.tab.inspect', entry: ENTRY_IDS.inspect },
]

export interface PanelTabsProps {
  tab: RunTab
  onChange(tab: RunTab): void
}

export function PanelTabs({ tab, onChange }: PanelTabsProps): ReactNode {
  return (
    <div className="jx-tabs" role="tablist" aria-label={t('run.aria.panel')}>
      {TABS.map((spec) => (
        <button
          key={spec.id}
          type="button"
          role="tab"
          aria-selected={tab === spec.id}
          className={tab === spec.id ? 'jx-tab is-active' : 'jx-tab'}
          {...(spec.entry === undefined ? {} : { 'data-entry': spec.entry })}
          onClick={() => onChange(spec.id)}
        >
          {t(spec.label)}
        </button>
      ))}
    </div>
  )
}
