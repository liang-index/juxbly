// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolVersion } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { VersionList } from './version-list'

/**
 * The version list — `task/stage-1-12.md` Scope 4 (C3), `docs/ARCHITECTURE.md` §8.1 / §9.3.
 *
 * The assertions are the three things the design actually claims:
 *
 * - it is **a plain list**, not a switcher: one action per row, always secondary, and no
 *   "was broken" badge — `ever_broken` is recorded because it is a fact, and V1 draws
 *   nothing for it;
 * - the version in effect **has no action**, because rolling back to where you already are
 *   is not an operation;
 * - a rollback reports **which** version, so the caller cannot apply the wrong one.
 *
 * Wiring into the settings panel belongs to 1-16; this component is the whole entry point.
 */

function definition(version: number): ToolDefinition {
  return {
    tool_id: 'tool_8f3a2b',
    name: 'Shop results',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version,
    created_at: '2026-09-08T10:00:00.000Z',
    updated_at: '2026-09-08T10:00:00.000Z',
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.product',
        fields: { title: '.title' },
        field_types: { title: 'text' },
        output_to: 'raw_items',
      },
    ],
  }
}

function version(number: number, everBroken = false): ToolVersion {
  return {
    version: number,
    definition: definition(number),
    note: `v${number} note`,
    ever_broken: everBroken,
    created_at: '2026-09-08T10:00:00.000Z',
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

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('version list', () => {
  it('lists newest first and offers rollback only where there is somewhere to go', () => {
    const onRollback = vi.fn()
    const node = render(
      <VersionList versions={[version(1, true), version(2)]} activeVersion={2} onRollback={onRollback} />,
    )

    const names = [...node.querySelectorAll('.jx-version-name')].map(
      (element) => element.textContent,
    )
    expect(names).toEqual(['v2', 'v1'])

    // The version in effect gets a label, not a button.
    expect(node.textContent).toContain(t('config.versions.current'))
    expect(node.querySelectorAll('button')).toHaveLength(1)

    click(node.querySelector('button') as Element)
    expect(onRollback).toHaveBeenCalledWith(1)
  })

  it('draws nothing for ever_broken — it is a recorded fact, not a badge', () => {
    const node = render(
      <VersionList versions={[version(1, true), version(2)]} activeVersion={2} onRollback={() => {}} />,
    )

    // The flag is stored for later; V1 deliberately shows no icon, no colour, no wording.
    expect(node.textContent).not.toContain('broken')
    expect(node.querySelector('[data-ever-broken]')).toBeNull()
  })

  it('says so rather than showing a blank area when there is one version', () => {
    const node = render(<VersionList versions={[]} activeVersion={1} onRollback={() => {}} />)

    expect(node.querySelector('.jx-versions')).toBeNull()
    expect(node.textContent).toContain(t('config.versions.empty'))
  })
})
