// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolOverviewItem, UsageStats } from '@juxbly/core'
import { t } from '../copy'
import { Options } from './Options'
import type { ManagePorts, SettingsPorts } from './ports'

/**
 * The options page — `task/stage-1-13.md` AC 4 / 6 / 8 / 10, `docs/UI_SPEC.md` §7.2 / §7.4.
 *
 * Two disciplines are worth a test and would not survive a screenshot review:
 *
 *   - **Three numbers, and nothing invented.** Runs are countable; "time saved" needs an
 *     assumption the product does not have, so the count is the number and there is no
 *     fourth tile (§7.2). The privacy line is part of the same block: zero telemetry is a
 *     promise, and a promise only holds when it is visible (§7.4).
 *   - **Removal is the only exit and it is confirmed twice.** V1 has no archive (C1): a
 *     tool is listed or it is gone, so the first click must ask and only the second may
 *     act. A single click that deletes would be the one irreversible thing in the product
 *     with no step between wanting it and doing it.
 */
const NOW = Date.parse('2026-09-09T12:00:00.000Z')

const STATS: UsageStats = { totalTools: 3, addedThisWeek: 1, totalRuns: 42 }

function tool(): ToolOverviewItem {
  return {
    toolId: 'tool_1',
    name: 'Shop results',
    category: 'data',
    domain: 'shop.example.com',
    lastUsedAt: '2026-09-09T11:30:00.000Z',
    status: 'healthy',
    url: 'https://shop.example.com/',
  }
}

function settings(overrides: Partial<SettingsPorts> = {}): SettingsPorts {
  return {
    load: async () => ({
      key_set: true,
      key_hint: '…1234',
      api_base_url: null,
      model: null,
      floating_ball_enabled: true,
    }),
    save: async () => true,
    test: async () => null,
    ...overrides,
  }
}

function manage(overrides: Partial<ManagePorts> = {}): ManagePorts {
  return {
    listTools: async () => [tool()],
    stats: async () => STATS,
    deleteTool: async () => true,
    ...overrides,
  }
}

let container: HTMLElement
let root: Root | undefined

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = undefined
  container.remove()
})

function render(node: ReactNode): HTMLElement {
  act(() => {
    root = createRoot(container)
    root.render(node)
  })
  return container
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function buttonsWith(node: HTMLElement, label: string): HTMLButtonElement[] {
  return [...node.querySelectorAll('button')].filter(
    (element) => element.textContent?.trim() === label,
  ) as HTMLButtonElement[]
}

describe('usage panel (§7.2 / §7.4)', () => {
  it('shows three numbers and no estimated value', async () => {
    const node = render(<Options settings={settings()} manage={manage()} now={NOW} />)
    await flush()

    const terms = [...node.querySelectorAll('.jx-options-stats dt')]
    expect(terms.map((term) => term.textContent)).toEqual([
      t('options.stats.tools'),
      t('options.stats.added_this_week'),
      t('options.stats.total_runs'),
    ])
    // Runs are counted; "time saved" would need an assumption the product does not have.
    expect(node.textContent).not.toMatch(/time saved|hours saved|minutes saved/i)
  })

  it('reads the run total from the same count the result area writes', async () => {
    const node = render(<Options settings={settings()} manage={manage()} now={NOW} />)
    await flush()

    const values = [...node.querySelectorAll('.jx-options-stats dd')].map(
      (value) => value.textContent,
    )
    expect(values).toContain('42')
  })

  it('keeps the privacy line next to the numbers — a promise only holds when it is visible', async () => {
    const node = render(<Options settings={settings()} manage={manage()} now={NOW} />)
    await flush()

    expect(node.textContent).toContain(t('options.stats.privacy'))
  })

  it('says something when there are no tools, and never renders an empty list', async () => {
    const node = render(
      <Options settings={settings()} manage={manage({ listTools: async () => [] })} now={NOW} />,
    )
    await flush()

    expect(node.textContent).toContain(t('options.manage.empty'))
    expect(node.querySelectorAll('.jx-options-row').length).toBe(0)
  })
})

describe('removal (AC 10)', () => {
  it('asks before it deletes: the first click only asks', async () => {
    const deleteTool = vi.fn(async () => true)
    const node = render(
      <Options settings={settings()} manage={manage({ deleteTool })} now={NOW} />,
    )
    await flush()

    const remove = buttonsWith(node, t('options.manage.delete'))
    expect(remove.length).toBe(1)
    click(remove[0] as HTMLButtonElement)

    expect(deleteTool).not.toHaveBeenCalled()
    expect(node.textContent).toContain(t('options.manage.confirm'))
  })

  it('deletes on the confirm click, once', async () => {
    const deleteTool = vi.fn(async () => true)
    const node = render(
      <Options settings={settings()} manage={manage({ deleteTool })} now={NOW} />,
    )
    await flush()

    click(buttonsWith(node, t('options.manage.delete'))[0] as HTMLButtonElement)
    const confirm = buttonsWith(node, t('options.manage.confirm_ok'))
    expect(confirm.length).toBe(1)
    click(confirm[0] as HTMLButtonElement)
    await flush()

    expect(deleteTool).toHaveBeenCalledTimes(1)
    expect(deleteTool).toHaveBeenCalledWith('tool_1')
  })

  it('keeping is one click and costs nothing', async () => {
    const deleteTool = vi.fn(async () => true)
    const node = render(
      <Options settings={settings()} manage={manage({ deleteTool })} now={NOW} />,
    )
    await flush()

    click(buttonsWith(node, t('options.manage.delete'))[0] as HTMLButtonElement)
    click(buttonsWith(node, t('options.manage.cancel'))[0] as HTMLButtonElement)
    await flush()

    expect(deleteTool).not.toHaveBeenCalled()
    expect(node.textContent).not.toContain(t('options.manage.confirm'))
  })

  it('reports a refused delete instead of silently keeping the row', async () => {
    const node = render(
      <Options settings={settings()} manage={manage({ deleteTool: async () => false })} now={NOW} />,
    )
    await flush()

    click(buttonsWith(node, t('options.manage.delete'))[0] as HTMLButtonElement)
    click(buttonsWith(node, t('options.manage.confirm_ok'))[0] as HTMLButtonElement)
    await flush()

    expect(node.textContent).toContain(t('options.manage.delete_failed'))
  })
})

describe('floating-ball switch (AC 4 / AC 5)', () => {
  it('reflects the stored setting and writes a single field on change', async () => {
    const save = vi.fn(async () => true)
    const node = render(
      <Options settings={settings({ save })} manage={manage()} now={NOW} />,
    )
    await flush()

    const checkbox = node.querySelector('.jx-options-check input')
    expect((checkbox as HTMLInputElement).checked).toBe(true)

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set
      setter?.call(checkbox, false)
      checkbox?.dispatchEvent(new Event('click', { bubbles: true }))
    })
    await flush()

    expect(save).toHaveBeenCalledWith({ floating_ball_enabled: false })
  })

  it('says turning the ball off costs nothing else — the toolbar entry stays', async () => {
    const node = render(<Options settings={settings()} manage={manage()} now={NOW} />)
    await flush()

    expect(node.textContent).toContain(t('options.ball.hint'))
  })
})
