/**
 * The toolbar overview's rows — `docs/UI_SPEC.md` §7.2, stage 1-13.
 *
 * Pure on purpose: ordering and filtering are the two behaviours that carry the whole
 * design (most-recently-used first, no tiers, no archiving), and they are also the two
 * that a rendered component makes impossible to assert. The component below only draws
 * what this module returns.
 *
 * Two rules that look minor and are not:
 *
 * - **"Used" means run *or* export**, whichever happened later (PRODUCT §3.8.6). A tool
 *   that only ever exported would otherwise sink below tools the user cares about less.
 * - **Every tool appears.** V1 has no archive and no tiers (C1): an unused tool sinks by
 *   ordering and by nothing else. There is no hidden state to fall into.
 */
import type { HealthStatus, ToolOverviewItem } from '@juxbly/core'
import type { CopyKey } from '../copy'

/** The popup shows a handful, not a directory — the management surface is the directory. */
export const MAX_OVERVIEW_ROWS = 8

/** Most recently used first; never-used tools last, in the order storage gave them. */
export function sortTools(tools: readonly ToolOverviewItem[]): ToolOverviewItem[] {
  return [...tools].sort((a, b) => timestamp(b.lastUsedAt) - timestamp(a.lastUsedAt))
}

/** Case-insensitive, over name and host — the two things a row actually shows. */
export function filterTools(
  tools: readonly ToolOverviewItem[],
  query: string,
): ToolOverviewItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...tools]

  return tools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(needle) || tool.domain.toLowerCase().includes(needle),
  )
}

/** The rows the popup draws: sorted, then filtered, then capped. */
export function overviewRows(
  tools: readonly ToolOverviewItem[],
  query: string,
  limit: number = MAX_OVERVIEW_ROWS,
): ToolOverviewItem[] {
  return sortTools(filterTools(tools, query)).slice(0, limit)
}

/** `null` (never used) sorts last, so it maps below any real timestamp. */
function timestamp(at: string | null): number {
  if (at === null) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(at)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

/**
 * The dot's colour. Three values and no fourth: the dot is a glance, and the words beside
 * it are the actual statement (§7.2 — a dot alone is not an accessible status).
 */
export const STATUS_COLOR: Readonly<Record<HealthStatus, string>> = {
  healthy: 'var(--jx-accent)',
  degraded: 'var(--jx-warn)',
  broken: 'var(--jx-error)',
}

export const STATUS_COPY_KEY: Readonly<Record<HealthStatus, CopyKey>> = {
  healthy: 'popup.status.healthy',
  degraded: 'popup.status.degraded',
  broken: 'popup.status.broken',
}

export function statusColor(status: HealthStatus): string {
  return STATUS_COLOR[status] ?? STATUS_COLOR.healthy
}

export function statusCopyKey(status: HealthStatus): CopyKey {
  return STATUS_COPY_KEY[status] ?? STATUS_COPY_KEY.healthy
}
