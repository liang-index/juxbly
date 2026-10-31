// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { PresetPack } from './preset-pack'
import type { PresetItem, PresetPackPorts } from './ports'

/**
 * The preset pack section (stage 3-2 Track B).
 *
 * Three disciplines, each of which would rot quietly without a test:
 *
 *   - **The card says what the recipe says, and nothing else.** The claims on a card are
 *     the recipe's own data — a pack card that editorialises would promise more than the
 *     page that was verified delivered.
 *   - **A declined origin is reported as a decision, and the install does not proceed.**
 *     "Not added" is not an error to retry blindly, and the button stays reachable.
 *   - **Storage is the state, not the click.** A card reads `installedIds` on mount, so a
 *     preset already in storage reads "Added" — and an `already` reply marks it too,
 *     because a button offering a double install is a lie about what the tool list holds.
 */
const DEFINITION: ToolDefinition = {
  tool_id: 'tool_preset_fixture',
  name: 'Fixture Scraper',
  description: 'A fixture definition that only ever travels; nothing validates it here.',
  category: 'data',
  url_pattern: 'https://example.test/*',
  version: 1,
  steps: [
    {
      type: 'extract',
      selector: 'li',
      mode: 'list',
      fields: { title: 'h3' },
      field_types: { title: 'text' },
      output_to: 'raw_items',
    },
    { type: 'render', input_from: 'raw_items', view: 'table' },
  ],
  created_at: '2026-10-31T00:00:00.000Z',
  updated_at: '2026-10-31T00:00:00.000Z',
}

function preset(overrides: Partial<PresetItem> = {}): PresetItem {
  return {
    id: 'fixture-site-rows',
    title: 'Fixture Site — rows',
    description: 'Collects every row on the Fixture Site listing page.',
    siteLabel: 'Fixture Site',
    urlPattern: 'https://example.test/*',
    capabilities: ['extract', 'render'],
    definition: DEFINITION,
    ...overrides,
  }
}

function packPorts(
  items: readonly PresetItem[],
  overrides: Partial<PresetPackPorts> = {},
): PresetPackPorts {
  return {
    list: () => items,
    installedIds: async () => [],
    // The open-source surface: the origin is already covered, so no prompt ever fires.
    ensureSiteAccess: async () => true,
    install: async () => 'installed',
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

function buttonWith(node: HTMLElement, label: string): HTMLButtonElement {
  const button = [...node.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (button === undefined) throw new Error(`button "${label}" missing`)
  return button as HTMLButtonElement
}

describe('preset pack (stage 3-2)', () => {
  it('renders each card from its recipe data and invents nothing', async () => {
    const item = preset()
    const node = render(<PresetPack ports={packPorts([item])} />)
    await flush()

    expect(node.textContent).toContain(item.title)
    expect(node.textContent).toContain(item.description)
    expect(node.textContent).toContain(item.siteLabel)
    // The URL pattern is a permission string, not display copy: it stays out of the card.
    expect(node.textContent).not.toContain(item.urlPattern)
  })

  it('renders no section at all when the pack is empty', () => {
    const node = render(<PresetPack ports={packPorts([])} />)
    expect(node.querySelector('.jx-options-section')).toBeNull()
  })

  it('marks a preset storage already holds as Added, before any click', async () => {
    const install = vi.fn(async () => 'installed' as const)
    const node = render(
      <PresetPack ports={packPorts([preset()], { installedIds: async () => ['tool_preset_fixture'], install })} />,
    )
    await flush()

    const added = buttonWith(node, t('options.presets.added'))
    expect(added.disabled).toBe(true)
    expect(install).not.toHaveBeenCalled()
  })

  it('installs inside the click: access first, then the definition', async () => {
    const ensureSiteAccess = vi.fn(async () => true)
    const install = vi.fn(async () => 'installed' as const)
    const node = render(
      <PresetPack ports={packPorts([preset()], { ensureSiteAccess, install })} />,
    )
    await flush()

    const button = buttonWith(node, t('options.presets.install'))
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    // The ask precedes the message round trip — the gesture rule the BYOK form established.
    expect(ensureSiteAccess).toHaveBeenCalledWith('https://example.test/*')
    expect(install).toHaveBeenCalledWith(DEFINITION)
    expect(buttonWith(node, t('options.presets.added')).disabled).toBe(true)
  })

  it('reports a declined origin as a decision and keeps the button reachable', async () => {
    const install = vi.fn(async () => 'installed' as const)
    const node = render(
      <PresetPack ports={packPorts([preset()], { ensureSiteAccess: async () => false, install })} />,
    )
    await flush()

    act(() => {
      buttonWith(node, t('options.presets.install')).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    await flush()

    expect(install).not.toHaveBeenCalled()
    expect(node.textContent).toContain(t('options.presets.access_denied'))
    expect(node.textContent).not.toContain(t('options.presets.added'))
    expect(buttonWith(node, t('options.presets.install')).disabled).toBe(false)
  })

  it("marks an 'already' reply as Added instead of offering a double install", async () => {
    const node = render(
      <PresetPack ports={packPorts([preset()], { install: async () => 'already' })} />,
    )
    await flush()

    act(() => {
      buttonWith(node, t('options.presets.install')).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    await flush()

    expect(buttonWith(node, t('options.presets.added')).disabled).toBe(true)
  })

  it('reports a failed install and stays installable', async () => {
    const node = render(
      <PresetPack ports={packPorts([preset()], { install: async () => 'failed' })} />,
    )
    await flush()

    act(() => {
      buttonWith(node, t('options.presets.install')).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    await flush()

    expect(node.textContent).toContain(t('options.presets.failed'))
    expect(node.textContent).not.toContain(t('options.presets.added'))
    expect(buttonWith(node, t('options.presets.install')).disabled).toBe(false)
  })
})
