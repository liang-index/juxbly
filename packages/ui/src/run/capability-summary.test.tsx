// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { CapabilitySummary, groupCapabilities, scanCapabilities } from './capability-summary'

/**
 * The capability summary — `task/stage-1-16.md` Scope 6 / Tests, AC 5.
 *
 * The two things the scan promises:
 *
 * - **static** — nothing runs, and the component is given a definition, not a page;
 * - **separated** — a network hop is drawn apart from the local reads and in `warn`,
 *   because mixed into the list it would be invisible, and an invisible warning is not
 *   a defence against indirect prompt injection.
 *
 * Honesty is the third promise: a `custom` llm instruction gets "cannot tell you",
 * which is the reachable case in V1 — not a decorative branch.
 */
const AT = '2026-09-09T00:00:00.000Z'

function definition(steps: ToolDefinition['steps']): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name: 'Deals',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps,
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

const LOCAL_ONLY = definition([
  {
    type: 'extract',
    mode: 'list',
    selector: '.deal',
    fields: { title: '.title', price: '.price' },
    output_to: 'raw_items',
  },
  {
    type: 'transform',
    op: 'sort',
    field: 'price',
    order: 'asc',
    input_from: 'raw_items',
    output_to: 'deals',
  },
])

const WITH_LLM = definition([
  ...LOCAL_ONLY.steps,
  { type: 'llm', task: 'summarize', input_from: 'raw_items', output_to: 'digest' },
])

describe('scanCapabilities', () => {
  it('reads every step of the definition, in order, from the definition only', () => {
    const lines = scanCapabilities(WITH_LLM)

    expect(lines.map((line) => line.risk)).toEqual([undefined, undefined, 'network'])
  })

  it('classifies the model step as the thing that leaves the device', () => {
    const lines = scanCapabilities(WITH_LLM)

    expect(lines[2]?.label).toBe(t('run.capability.llm'))
  })

  it('says it cannot tell for a custom instruction — honesty, not a shrug', () => {
    const lines = scanCapabilities(
      definition([
        { type: 'llm', task: 'custom', prompt: 'rate these deals', input_from: 'x', output_to: 'y' },
      ]),
    )

    expect(lines[0]?.detail).toBe(t('run.capability.custom'))
  })
})

describe('groupCapabilities (AC 5: warn, separated)', () => {
  it('splits local reads from the step that goes over the network', () => {
    const groups = groupCapabilities(scanCapabilities(WITH_LLM))

    expect(groups.plain).toHaveLength(2)
    expect(groups.sensitive.map((line) => line.risk)).toEqual(['network'])
  })

  it('groups a cookie-reading line with the sensitive ones — the category exists', () => {
    const groups = groupCapabilities([
      { label: 'Read text from this page', detail: '2 fields' },
      { label: 'Read session state', detail: null, risk: 'cookie' },
    ])

    expect(groups.sensitive.map((line) => line.risk)).toEqual(['cookie'])
    expect(groups.plain).toHaveLength(1)
  })
})

describe('CapabilitySummary component', () => {
  it('draws the sensitive group apart, in warn, with its reason', () => {
    const node = render(<CapabilitySummary tool={WITH_LLM} />)

    const sensitive = node.querySelector('.jx-capability-sensitive')
    expect(sensitive).not.toBeNull()
    expect(sensitive?.textContent).toContain(t('run.capability.sensitive'))
    expect(sensitive?.textContent).toContain(t('run.capability.network'))
    expect(sensitive?.querySelector('.jx-capability-item--risk')).not.toBeNull()
  })

  it('draws nothing sensitive when the tool never leaves the device', () => {
    const node = render(<CapabilitySummary tool={LOCAL_ONLY} />)

    expect(node.querySelector('.jx-capability-sensitive')).toBeNull()
    expect(node.textContent).toContain(t('run.capability.extract'))
  })

  it('carries the static caveat — the summary declares, it does not run', () => {
    const node = render(<CapabilitySummary tool={WITH_LLM} />)

    expect(node.textContent).toContain(t('run.capability.caveat'))
  })
})
