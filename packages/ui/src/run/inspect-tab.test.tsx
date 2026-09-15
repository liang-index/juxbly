// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunStepTrace } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { InspectTab } from './inspect-tab'

/**
 * The runtime inspector's behaviour — `task/stage-1-16.md` Scope 3, AC 1.
 *
 * What a node test cannot see and this one can: the steps are **interactive** (click a
 * step, see what it was handed), the failure is legible, and the whole debug surface is
 * a list plus a detail — not a wall of JSON.
 */
const AT = '2026-09-09T00:00:00.000Z'

function definition(): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name: 'Deals',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.deal',
        fields: { title: '.title' },
        output_to: 'raw_items',
      },
      { type: 'transform', op: 'filter', input_from: 'raw_items', output_to: 'deals' },
      { type: 'llm', task: 'summarize', input_from: 'deals', output_to: 'digest' },
    ],
  }
}

function trace(): RunStepTrace[] {
  return [
    { index: 0, type: 'extract', inputCount: null, outputTo: 'raw_items', durationMs: 4 },
    { index: 1, type: 'transform', inputCount: 3, outputTo: 'deals', durationMs: 1 },
    {
      index: 2,
      type: 'llm',
      inputCount: 1,
      outputTo: 'digest',
      durationMs: 640,
      error: { code: 'LLM_FAILED', message: 'the endpoint refused the key' },
    },
  ]
}

const OUTPUTS = {
  raw_items: [{ title: 'a' }, { title: 'b' }],
  deals: [{ title: 'a' }],
  digest: 'two deals',
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

describe('runtime inspect tab (AC 1)', () => {
  it('shows the pipeline as a step list with each step’s duration', () => {
    const node = render(<InspectTab tool={definition()} trace={trace()} outputs={OUTPUTS} />)

    const steps = [...node.querySelectorAll('.jx-step')]
    expect(steps.map((step) => step.querySelector('.jx-step-type')?.textContent)).toEqual([
      'extract',
      'transform',
      'llm',
    ])
    expect(steps[0]?.textContent).toContain(t('run.inspect.ms', { ms: 4 }))
  })

  it('draws extract’s input as the page itself, not a variable dump', () => {
    const node = render(<InspectTab tool={definition()} trace={trace()} outputs={OUTPUTS} />)

    expect(node.querySelector('[data-testid="step-detail"]')?.textContent).toContain(
      t('run.inspect.page'),
    )
  })

  it('switches the detail to the selected step on click', () => {
    const node = render(<InspectTab tool={definition()} trace={trace()} outputs={OUTPUTS} />)

    click(node.querySelector('[data-testid="step-2"]') as Element)

    const detail = node.querySelector('[data-testid="step-detail"]')
    expect(detail?.textContent).toContain('two deals')
    expect(detail?.textContent).toContain(t('run.inspect.ms', { ms: 640 }))
  })

  it('shows a failed step’s reason in the detail', () => {
    const node = render(<InspectTab tool={definition()} trace={trace()} outputs={OUTPUTS} />)

    click(node.querySelector('[data-testid="step-2"]') as Element)

    expect(node.querySelector('.jx-inspect-note--error')?.textContent).toBe(
      'the endpoint refused the key',
    )
  })

  it('marks every step as not reached before anything has run — a list, never blank', () => {
    const node = render(<InspectTab tool={definition()} trace={null} outputs={null} />)

    expect(node.querySelectorAll('.jx-step')).toHaveLength(3)
    expect(node.querySelector('[data-testid="step-detail"]')?.textContent).toContain(
      t('run.inspect.skipped'),
    )
  })
})
