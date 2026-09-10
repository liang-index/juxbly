// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolOverviewItem } from '@juxbly/core'
import { t } from '../copy'
import { Popup } from './Popup'
import type { OverviewPorts } from './ports'

/**
 * The toolbar overview — `task/stage-1-13.md` AC 3, `docs/UI_SPEC.md` §7.2.
 *
 * The popup is deliberately not a management surface: **no delete and no edit**, because
 * removing a tool is a considered act and does not belong in a 320px list you opened to
 * jump somewhere. What it has to get right is the jump, and the honesty of each row:
 *
 *   - the site is a **host**, never a URL — a path is noise here and a browsing detail the
 *     user did not ask to display;
 *   - the state is **in words**, not only in the colour of a dot (a dot alone is invisible
 *     to a screen reader and to a third of the population's colour perception);
 *   - an empty list says something, and a *failed* load says a different thing: "no tools
 *     yet" and "that could not be loaded" are not the same state.
 */
const NOW = Date.parse('2026-09-09T12:00:00.000Z')

function tool(overrides: Partial<ToolOverviewItem> = {}): ToolOverviewItem {
  return {
    toolId: 'tool_1',
    name: 'Shop results',
    category: 'data',
    domain: 'shop.example.com',
    lastUsedAt: '2026-09-09T11:30:00.000Z',
    status: 'healthy',
    url: 'https://shop.example.com/',
    ...overrides,
  }
}

function ports(tools: ToolOverviewItem[], overrides: Partial<OverviewPorts> = {}): OverviewPorts {
  return {
    listTools: async () => tools,
    openTab: async () => true,
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

describe('toolbar overview', () => {
  it('shows the host, not the URL, and a relative time', async () => {
    const node = render(<Popup ports={ports([tool()], {})} helpUrl="https://example.test/readme" now={NOW} />)
    await flush()

    const row = node.querySelector('.jx-popup-row')
    expect(row?.textContent).toContain('shop.example.com')
    expect(row?.textContent).not.toContain('https://')
    expect(row?.textContent).toContain(t('run.time.minutes'))
  })

  it('states the health in words — the dot is never the only signal', async () => {
    const node = render(<Popup ports={ports([tool({ status: 'broken' })])} helpUrl="#" now={NOW} />)
    await flush()

    expect(node.querySelector('.jx-popup-status')?.textContent).toBe(t('popup.status.broken'))
    expect(node.querySelector('.jx-popup-dot')).not.toBeNull()
    // The dot is decoration: hidden from assistive tech, the word carries the meaning.
    expect(node.querySelector('.jx-popup-dot')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('filters as you type, over both the name and the host', async () => {
    const rows = [
      tool({ toolId: 'a', name: 'Shop results', domain: 'shop.example.com' }),
      tool({ toolId: 'b', name: 'Headlines', domain: 'news.example.com' }),
    ]
    const node = render(<Popup ports={ports(rows)} helpUrl="#" now={NOW} />)
    await flush()
    expect(node.querySelectorAll('.jx-popup-row').length).toBe(2)

    const search = node.querySelector('.jx-popup-search')
    if (search === null) throw new Error('search input missing')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(search, 'news')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(node.querySelectorAll('.jx-popup-row').length).toBe(1)
    expect(node.textContent).toContain('Headlines')
  })

  it('clicking a row hands the URL to the background — choosing a tab is not the popup’s call', async () => {
    const openTab = vi.fn(async () => true)
    const node = render(
      <Popup ports={ports([tool()], { openTab })} helpUrl="#" now={NOW} />,
    )
    await flush()

    const row = node.querySelector('.jx-popup-row')
    if (row === null) throw new Error('row missing')
    click(row)

    expect(openTab).toHaveBeenCalledWith('https://shop.example.com/')
  })

  it('offers no delete and no edit — removal belongs to the management surface', async () => {
    const node = render(<Popup ports={ports([tool()])} helpUrl="#" now={NOW} />)
    await flush()

    const labels = [...node.querySelectorAll('button, a')].map((element) =>
      (element.textContent ?? '').trim(),
    )
    expect(labels).not.toContain(t('options.manage.delete'))
    expect(labels).not.toContain(t('options.byok.save'))
  })

  it('says something when there is nothing to list, and something else when the load failed', async () => {
    const empty = render(<Popup ports={ports([])} helpUrl="#" now={NOW} />)
    await flush()
    expect(empty.textContent).toContain(t('popup.empty'))

    act(() => {
      root?.unmount()
    })

    const broken = render(
      <Popup
        ports={{
          listTools: async () => {
            throw new Error('no reply')
          },
          openTab: async () => true,
        }}
        helpUrl="#"
        now={NOW}
      />,
    )
    await flush()
    expect(broken.textContent).toContain(t('popup.open_failed'))
    expect(broken.textContent).not.toContain(t('popup.empty'))
  })

  it('keeps a help link at the bottom — there for whoever looks, never pushed', async () => {
    const node = render(<Popup ports={ports([tool()])} helpUrl="https://example.test/readme" now={NOW} />)
    await flush()

    const help = node.querySelector('.jx-popup-help')
    expect(help?.getAttribute('href')).toBe('https://example.test/readme')
    // The footer is the last thing in the panel: help is not a call to action.
    const foot = node.querySelector('.jx-popup-foot')
    expect(node.querySelector('.jx-popup')?.lastElementChild).toBe(foot)
    expect(foot?.contains(help ?? null)).toBe(true)
  })

  /**
   * The standing entry into key management (PRODUCT §7.1 / AC 4).
   *
   * It is a plain relative link and not a `chrome.*` call on purpose: the toolbar surface
   * is an entrypoint, and §6.4 lets only the background touch platform APIs.
   */
  it('carries a settings entry, relative to the extension’s own origin', async () => {
    const node = render(
      <Popup ports={ports([tool()])} helpUrl="#" settingsUrl="options.html" now={NOW} />,
    )
    await flush()

    const settings = [...node.querySelectorAll('a')].find(
      (element) => element.textContent?.trim() === t('popup.settings'),
    )
    expect(settings?.getAttribute('href')).toBe('options.html')
  })

  it('has no settings entry when the host does not hand one in', async () => {
    const node = render(<Popup ports={ports([tool()])} helpUrl="#" now={NOW} />)
    await flush()

    expect(
      [...node.querySelectorAll('a')].some(
        (element) => element.textContent?.trim() === t('popup.settings'),
      ),
    ).toBe(false)
  })
})
