import type { ToolOverviewItem } from '@juxbly/core'
import { describe, expect, it } from 'vitest'
import {
  filterTools,
  MAX_OVERVIEW_ROWS,
  overviewRows,
  sortTools,
  statusCopyKey,
  statusColor,
} from '@juxbly/ui'

/**
 * The overview's ordering and filtering — `task/stage-1-13.md` AC 3 / AC 8,
 * `docs/UI_SPEC.md` §7.2.
 *
 * Two cases here carry more than their weight:
 *
 * - **Export-only is a use.** `mostRecentUse` takes the more recent of run and export
 *   (PRODUCT §3.8.6); a tool the user only ever exported would otherwise sink below tools
 *   they care about less.
 * - **No tiers.** Every tool is in the list; an unused one sinks by ordering alone (C1).
 *   There is no filter, no hidden flag, no second list to fall into.
 */

const NOW = Date.parse('2026-09-09T12:00:00Z')

function tool(partial: Partial<ToolOverviewItem>): ToolOverviewItem {
  return {
    toolId: 't',
    name: 'Tool',
    category: 'data',
    domain: 'example.com',
    lastUsedAt: null,
    status: 'healthy',
    url: 'https://example.com/',
    ...partial,
  }
}

describe('ordering (AC 8)', () => {
  it('puts the most recently used first', () => {
    const rows = sortTools([
      tool({ toolId: 'a', lastUsedAt: '2026-09-01T10:00:00Z' }),
      tool({ toolId: 'b', lastUsedAt: '2026-09-08T10:00:00Z' }),
      tool({ toolId: 'c', lastUsedAt: '2026-09-03T10:00:00Z' }),
    ])

    expect(rows.map((row) => row.toolId)).toEqual(['b', 'c', 'a'])
  })

  it('treats an export as a use, by the later of run and export', () => {
    const rows = sortTools([
      // `b` ran once, long ago; `a` never ran but was exported yesterday.
      tool({ toolId: 'b', lastUsedAt: '2026-09-01T10:00:00Z' }),
      tool({ toolId: 'a', lastUsedAt: '2026-09-08T10:00:00Z' }),
    ])

    expect(rows[0]?.toolId).toBe('a')
  })

  it('sinks never-used tools below everything, without hiding them', () => {
    const rows = sortTools([
      tool({ toolId: 'unused' }),
      tool({ toolId: 'old', lastUsedAt: '2026-01-01T00:00:00Z' }),
    ])

    expect(rows.map((row) => row.toolId)).toEqual(['old', 'unused'])
    expect(rows).toHaveLength(2)
  })
})

describe('filtering (AC 3)', () => {
  const rows = [
    tool({ toolId: '1', name: 'Price list', domain: 'shop.example.com' }),
    tool({ toolId: '2', name: 'Headlines', domain: 'news.example.com' }),
  ]

  it('matches on name or host, case-insensitively', () => {
    expect(filterTools(rows, 'price').map((row) => row.toolId)).toEqual(['1'])
    expect(filterTools(rows, 'NEWS').map((row) => row.toolId)).toEqual(['2'])
  })

  it('keeps everything for a blank query', () => {
    expect(filterTools(rows, '   ')).toHaveLength(2)
  })
})

describe('row cap', () => {
  it('shows a handful, not a directory', () => {
    expect(MAX_OVERVIEW_ROWS).toBeGreaterThanOrEqual(5)
    expect(MAX_OVERVIEW_ROWS).toBeLessThanOrEqual(8)

    const many = Array.from({ length: 40 }, (_, index) =>
      tool({ toolId: String(index), lastUsedAt: new Date(NOW - index * 60_000).toISOString() }),
    )
    expect(overviewRows(many, '')).toHaveLength(MAX_OVERVIEW_ROWS)
    // The cap keeps the *newest* rows, never an arbitrary subset.
    expect(overviewRows(many, '')[0]?.toolId).toBe('0')
  })
})

describe('row status (AC 3: the dot is never the only signal)', () => {
  it('carries words beside the colour, and the colours are the three token states', () => {
    expect(statusCopyKey('healthy')).toBe('popup.status.healthy')
    expect(statusCopyKey('degraded')).toBe('popup.status.degraded')
    expect(statusCopyKey('broken')).toBe('popup.status.broken')

    expect(statusColor('healthy')).not.toBe(statusColor('degraded'))
    expect(statusColor('degraded')).not.toBe(statusColor('broken'))
  })
})
