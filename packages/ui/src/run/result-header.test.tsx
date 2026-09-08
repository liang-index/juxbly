// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { CATEGORY_COLOR } from './category'
import { PromiseLine } from './promise-line'
import { ResultHeader, relativeTime } from './result-header'
import { RetentionLine } from './retention-line'

/**
 * The provenance segment — `task/stage-1-10.md` AC 10, `docs/UI_SPEC.md` §7.3.
 *
 * Three of the five segments are assertions about *identity*: the tool's name and colour,
 * the promise the product makes, and what happens to a tool the user no longer wants. All
 * three are easy to get wrong in a way a screenshot would not catch — a dot that takes its
 * colour from a second map, a promise that never shrinks, an undo that deletes without
 * asking.
 *
 * The colour assertion reads `tokens.css` from disk for the same reason
 * `floating-ball/ball.test.tsx` does: the variable is the contract, and a literal that
 * happens to look right is a recolor waiting to be found (UI_SPEC §11.4).
 */
const UI_SRC = join(process.cwd(), 'packages', 'ui', 'src')
const tokensCss = readFileSync(join(UI_SRC, 'tokens.css'), 'utf8')

const AT = '2026-09-07T00:00:00.000Z'
const NOW = Date.parse('2026-09-07T00:05:00.000Z')
const USAGE = { prompt_tokens: 1200, completion_tokens: 300 }

let container: HTMLElement
let root: Root | undefined

beforeEach(() => {
  // React 19 only flushes effects and state updates inside `act` when this flag is set.
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

function tool(category: ToolDefinition['category'], name = 'Deals under $50'): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name,
    description: 'Reads the results list.',
    category,
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [{ type: 'render', view: 'table', input_from: 'raw_items' }],
  }
}

describe('result header (§7.3 segment ①)', () => {
  it('names the tool, its colour, its age, its size and its cost', () => {
    const node = render(
      <ResultHeader tool={tool('analyze')} at={AT} itemCount={3} usage={USAGE} now={NOW} />,
    )

    const dot = node.querySelector('.jx-run-dot')
    expect(dot?.getAttribute('style')).toContain(CATEGORY_COLOR.analyze)
    expect(node.textContent).toContain('Deals under $50')
    expect(node.textContent).toContain('3 items')
    expect(node.textContent).toContain('1,200 in / 300 out tokens')
    expect(node.textContent).toContain('5 min ago')
  })

  it('shows no token line when no model call was made (BYOK transparency, §9 rule 4)', () => {
    const node = render(
      <ResultHeader tool={tool('data')} at={AT} itemCount={3} usage={null} now={NOW} />,
    )

    expect(node.textContent).not.toContain(t('run.tokens.unit'))
  })

  it('shows no age before the first finished run', () => {
    const node = render(
      <ResultHeader tool={tool('data')} at={null} itemCount={0} usage={null} now={NOW} />,
    )

    expect(node.textContent).not.toContain(t('run.time.just'))
    expect(node.textContent).toContain('0 items')
  })

  it('takes every category colour from one map, and the map only names tokens', () => {
    for (const value of Object.values(CATEGORY_COLOR)) {
      const variable = /var\((--[\w-]+)\)/.exec(value)?.[1]
      expect(variable).toBeDefined()
      expect(tokensCss).toContain(`${variable}:`)
    }
  })
})

describe('relative time', () => {
  it('reads as an age, not a timestamp', () => {
    const at = '2026-09-07T00:00:00.000Z'
    const base = Date.parse(at)

    expect(relativeTime(at, base + 5_000)).toBe('just now')
    expect(relativeTime(at, base + 5 * 60_000)).toBe('5 min ago')
    expect(relativeTime(at, base + 2 * 3_600_000)).toBe('2 h ago')
  })

  it('says nothing rather than lying about an unparseable time', () => {
    expect(relativeTime('not a date', NOW)).toBe('')
  })
})

describe('promise line (§7.3 segment ④)', () => {
  it('explains itself once, then states the fact (§3.5.4)', () => {
    expect(render(<PromiseLine firstToolBuilt={false} />).textContent).toBe(t('run.promise.first'))
  })

  it('shrinks once a tool has been seen working', () => {
    const node = render(<PromiseLine firstToolBuilt />)

    expect(node.textContent).toBe(t('run.promise.recurring'))
    expect(node.textContent).not.toBe(t('run.promise.first'))
  })
})

describe('retention line (§7.3 segment ⑤)', () => {
  it('states retention as a fact and offers an undo', () => {
    const node = render(<RetentionLine onDiscard={vi.fn()} />)

    expect(node.textContent).toContain(t('run.saved'))
    expect(node.textContent).toContain(t('run.undo'))
  })

  it('asks once more before it removes the tool (§7: no direct deletion)', () => {
    const onDiscard = vi.fn()
    const node = render(<RetentionLine onDiscard={onDiscard} />)

    const undo = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.undo'),
    )
    if (undo === undefined) throw new Error('no undo control')
    click(undo)

    expect(node.textContent).toContain(t('run.discard.confirm'))
    expect(onDiscard).not.toHaveBeenCalled()

    const remove = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.discard.confirm_ok'),
    )
    if (remove === undefined) throw new Error('no confirm control')
    click(remove)

    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('goes back to "saved" when the user keeps the tool', () => {
    const onDiscard = vi.fn()
    const node = render(<RetentionLine onDiscard={onDiscard} />)

    const undo = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.undo'),
    )
    if (undo === undefined) throw new Error('no undo control')
    click(undo)

    const keep = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.discard.cancel'),
    )
    if (keep === undefined) throw new Error('no cancel control')
    click(keep)

    expect(node.textContent).toContain(t('run.saved'))
    expect(onDiscard).not.toHaveBeenCalled()
  })
})
