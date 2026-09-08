import type { TokenUsage } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import type { ReactNode } from 'react'
import { t } from '../copy'
import { categoryColor } from './category'
import { TokenUsage as TokenUsageLine } from './token-usage'

/**
 * The result header — `docs/UI_SPEC.md` §7.3 segment ①.
 *
 * Five facts in `text-meta`: which tool (dot + name), when it ran, how much it found, and
 * what it cost. The category dot is the same colour the management page uses for the same
 * tool (§2.2: same origin, same value) — which is why the colour comes from one map and
 * not from a second switch here.
 */
export interface ResultHeaderProps {
  tool: ToolDefinition
  at: string | null
  itemCount: number
  usage: TokenUsage | null
  /** Injected so the relative time is a pure function of two numbers in tests. */
  now: number
}

export function ResultHeader({ tool, at, itemCount, usage, now }: ResultHeaderProps): ReactNode {
  return (
    <div className="jx-run-head">
      <span
        className="jx-run-dot"
        style={{ background: categoryColor(tool.category) }}
        aria-hidden="true"
      />
      <span className="jx-run-name">{tool.name}</span>
      {at === null ? null : <span className="jx-run-meta">{relativeTime(at, now)}</span>}
      <span className="jx-run-meta">
        {itemCount} {t('run.items')}
      </span>
      <TokenUsageLine usage={usage} />
    </div>
  )
}

/** "just now" / "N min ago" / "N h ago" — a run's age is what matters, not its timestamp. */
export function relativeTime(at: string, now: number): string {
  const then = Date.parse(at)
  if (Number.isNaN(then)) return ''

  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return t('run.time.just')

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${t('run.time.minutes')}`

  return `${Math.round(minutes / 60)} ${t('run.time.hours')}`
}
