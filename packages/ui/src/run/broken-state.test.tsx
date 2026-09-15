// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../copy'
import { BrokenState } from './broken-state'
import type { RunHealthVerdict } from './ports'

/**
 * The broken state — `task/stage-1-11.md` AC 6, `docs/UI_SPEC.md` §7.
 *
 * Broken is the one health state allowed the full error visual, and the copy rule that
 * comes with it is one sentence of what happened plus a direction — never a bare failure.
 * So the assertions are: it announces itself as an alert, it explains, and it offers a
 * way out. The CTA is the host's to wire (1-12 fills it with the repair flow); until
 * then the retry link stays, because a dead end is the one thing worse than an error
 * (`task/stage-1-11.md` Do Not Implement: 1-11 never repairs on its own).
 *
 * What is asserted *not* to happen matters as much: the component takes no definition
 * and no callback that could change one. A broken tool is reported, never rewritten —
 * the red line in `docs/ARCHITECTURE.md` §12.7.
 */
const REASON = 'the tool could not read the page any more'

function verdict(overrides: Partial<RunHealthVerdict> = {}): RunHealthVerdict {
  return {
    status: 'broken',
    changed: true,
    reason: REASON,
    layers: { execution: 'failed', result: 'ok', structure: 'no-baseline', semantic: 'not-run' },
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

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function buttonWith(node: HTMLElement, label: string): HTMLButtonElement {
  const found = [...node.querySelectorAll('button')].find((element) =>
    element.textContent?.includes(label),
  )
  if (found === undefined) throw new Error(`button not found: ${label}`)
  return found as HTMLButtonElement
}

describe('broken state', () => {
  it('announces the failure, explains it in one line, and offers a way out', () => {
    const node = render(<BrokenState health={verdict()} onRepair={() => {}} onRefresh={() => {}} />)

    expect(node.querySelector('.jx-run-state--broken')?.getAttribute('role')).toBe('alert')
    expect(node.textContent).toContain(t('run.health.broken'))
    expect(node.textContent).toContain(REASON)
    expect(node.textContent).toContain(t('run.health.repair'))
  })

  it('the repair CTA is the host action — one click, one call, no repair of its own', () => {
    const onRepair = vi.fn()
    const node = render(<BrokenState health={verdict()} onRepair={onRepair} onRefresh={() => {}} />)

    click(buttonWith(node, t('run.health.repair')))
    expect(onRepair).toHaveBeenCalledTimes(1)
    // Nothing else was invoked: reporting is all this stage does.
    expect(node.textContent).toContain(t('run.health.repair'))
  })

  it('without a repair handler it still leaves a retry — never a dead end', () => {
    const onRefresh = vi.fn()
    const node = render(<BrokenState health={verdict()} onRefresh={onRefresh} />)

    expect(node.textContent).not.toContain(t('run.health.repair'))
    click(buttonWith(node, t('run.health.retry')))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
