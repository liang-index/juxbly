// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../copy'
import { HealthBadge, type ManualCheckResult } from './health-badge'
import type { RunHealthVerdict } from './ports'

/**
 * The degraded badge — `task/stage-1-11.md` AC 6, `docs/UI_SPEC.md` §7.
 *
 * The rule this component exists to hold is *restraint*, and restraint is exactly what a
 * test can pin and a screenshot cannot: the badge must be present but quiet. So the
 * assertions are about what is **not** there — no dialog, no detail until asked, no
 * verdict when the check did not produce one — because a degraded tool still shows its
 * results, and interrupting a working result to announce a suspicion is the failure mode
 * (§7: warn is for suspected breakage only, and never for interrupting).
 *
 * The one thing the badge *does* have to state is the cost: the manual check spends the
 * user's tokens, so the number is part of the answer, not a debug detail (§9.4).
 */
const REASON = 'far fewer repeating blocks matched than before'

function verdict(overrides: Partial<RunHealthVerdict> = {}): RunHealthVerdict {
  return {
    status: 'degraded',
    changed: true,
    reason: REASON,
    layers: { execution: 'ok', result: 'ok', structure: 'drifted', semantic: 'not-run' },
    ...overrides,
  }
}

function check(overrides: Partial<ManualCheckResult> = {}): ManualCheckResult {
  return { pending: false, ...overrides }
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

describe('health badge (degraded)', () => {
  it('is a corner mark that says nothing until it is opened', () => {
    const node = render(<HealthBadge health={verdict()} check={null} onCheck={() => {}} />)

    const button = node.querySelector('.jx-health-q')
    expect(button?.textContent).toBe('?')
    // Quiet by default: the detail, and the cost it implies, wait for a click.
    expect(node.querySelector('.jx-health-detail')).toBeNull()
    expect(button?.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens inline — never as a dialog, never by interrupting', () => {
    const node = render(<HealthBadge health={verdict()} check={null} onCheck={() => {}} />)

    const button = node.querySelector('.jx-health-q')
    if (button === null) throw new Error('badge button missing')
    click(button)

    expect(node.querySelector('[role="dialog"]')).toBeNull()
    expect(node.querySelector('dialog')).toBeNull()
    expect(node.querySelector('.jx-health-detail')?.textContent).toContain(REASON)
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('offers the manual check inside the detail, and only once the detail is open', () => {
    const onCheck = vi.fn()
    const node = render(<HealthBadge health={verdict()} check={null} onCheck={onCheck} />)
    // The offer to spend tokens is not on the main surface — reflex spending is what the
    // throttle exists to prevent (§10).
    expect(node.textContent).not.toContain(t('run.health.check'))

    const button = node.querySelector('.jx-health-q')
    if (button === null) throw new Error('badge button missing')
    click(button)

    const checkButton = [...node.querySelectorAll('button')].find((element) =>
      element.textContent?.includes(t('run.health.check')),
    )
    if (checkButton === undefined) throw new Error('check button missing')
    click(checkButton)
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it('shows the check as pending, and does not offer a second one meanwhile', () => {
    const node = render(
      <HealthBadge health={verdict()} check={check({ pending: true })} onCheck={() => {}} />,
    )
    const button = node.querySelector('.jx-health-q')
    if (button === null) throw new Error('badge button missing')
    click(button)

    const checkButton = [...node.querySelectorAll('button')].find((element) =>
      element.textContent?.includes(t('run.health.checking')),
    )
    expect(checkButton?.hasAttribute('disabled')).toBe(true)
  })

  it('states the verdict and what it cost', () => {
    const node = render(
      <HealthBadge
        health={verdict()}
        check={check({
          ok: true,
          verdict: 'suspicious',
          reason: 'the rows are navigational links',
          usage: { prompt_tokens: 120, completion_tokens: 30 },
        })}
        onCheck={() => {}}
      />,
    )
    const button = node.querySelector('.jx-health-q')
    if (button === null) throw new Error('badge button missing')
    click(button)

    const detail = node.querySelector('.jx-health-detail')
    expect(detail?.textContent).toContain(t('run.health.check_suspicious'))
    // Tokens are the user's money; the number is part of the answer (§9.4).
    expect(detail?.textContent).toContain('150')
    expect(detail?.textContent).toContain(t('run.health.tokens'))
  })

  it('a check that did not run is reported as no answer, not as a verdict', () => {
    const node = render(
      <HealthBadge health={verdict()} check={check({ ok: false })} onCheck={() => {}} />,
    )
    const button = node.querySelector('.jx-health-q')
    if (button === null) throw new Error('badge button missing')
    click(button)

    const detail = node.querySelector('.jx-health-detail')
    expect(detail?.textContent).toContain(t('run.health.check_failed'))
    expect(detail?.textContent).not.toContain(t('run.health.check_suspicious'))
    expect(detail?.textContent).not.toContain(t('run.health.check_ok'))
  })

  // Ruling B (2026-09-09): "the page changed" only ever reaches degraded — a container
  // that stops matching returns hitCount 0, an answer, not an error (1-5) — so the repair
  // entry has to live here too, or the repair flow is unreachable on its own use case.
  it('offers the update entry inside the detail, and nowhere else', () => {
    const onRepair = vi.fn()
    const node = render(
      <HealthBadge health={verdict()} check={null} onCheck={() => {}} onRepair={onRepair} />,
    )
    // Same restraint as the check: an offer to rebuild is not on the main surface.
    expect(node.textContent).not.toContain(t('run.health.update'))

    const button = node.querySelector('.jx-health-q')
    if (button === null) throw new Error('badge button missing')
    click(button)

    const update = [...node.querySelectorAll('button')].find((element) =>
      element.textContent?.includes(t('run.health.update')),
    )
    if (update === undefined) throw new Error('update button missing')
    click(update)
    expect(onRepair).toHaveBeenCalledTimes(1)
  })

  it('without a repair handler it stays exactly as quiet as 1-11 left it', () => {
    const node = render(<HealthBadge health={verdict()} check={null} onCheck={() => {}} />)
    const button = node.querySelector('.jx-health-q')
    if (button === null) throw new Error('badge button missing')
    click(button)

    expect(node.textContent).not.toContain(t('run.health.update'))
  })
})
