// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../copy'
import { KeyRequest } from './KeyRequest'
import type { KeyRequestPorts } from './KeyRequest'
import { KEY_CREATE_URL } from './key-request'

/**
 * Node ③'s screen — `task/stage-1-13.md` AC 2 / 2a.
 *
 * The screen is a request for money, so the assertions are about what it must state before
 * the user can agree to anything: where the key comes from, what this build costs, and what
 * the most it can cost is. And one thing it must never do: **"Not now" writes nothing.** The
 * milestone means "the user was asked and served"; closing the screen is not that, so the
 * ask has to be free to decline and free to come back.
 */
const COST = { single: '$0.0043', ceiling: '$0.0129' }

function ports(overrides: Partial<KeyRequestPorts> = {}): KeyRequestPorts {
  return {
    saveKey: async () => true,
    markRequested: async () => undefined,
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

function buttonWith(node: HTMLElement, label: string): HTMLButtonElement {
  const button = [...node.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (button === undefined) throw new Error(`button "${label}" missing`)
  return button as HTMLButtonElement
}

function keyInput(node: HTMLElement): HTMLInputElement {
  const input = node.querySelector('.jx-key-input')
  if (input === null) throw new Error('key input missing')
  return input as HTMLInputElement
}

function type(node: HTMLElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(keyInput(node), value)
    keyInput(node).dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('key request (onboarding node ③)', () => {
  it('says what it costs and what the most it can cost is — two numbers, no hedge', () => {
    const node = render(
      <KeyRequest ports={ports()} cost={COST} onContinue={() => {}} onDismiss={() => {}} />,
    )

    expect(node.textContent).toContain(t('onboarding.key.cost', { amount: COST.single }))
    expect(node.textContent).toContain(t('onboarding.key.cost_retry', { amount: COST.ceiling }))
  })

  it('carries a way to get a key, and a way to get one for free', () => {
    const node = render(
      <KeyRequest ports={ports()} cost={COST} onContinue={() => {}} onDismiss={() => {}} />,
    )

    const hrefs = [...node.querySelectorAll('a')].map((link) => link.getAttribute('href'))
    expect(hrefs).toContain(KEY_CREATE_URL)
    // The zero-cost path (AC 2a): present, and carrying no allowance of its own.
    expect(node.textContent).toContain(t('options.free.link'))
  })

  it('checks the format here, before anything is sent anywhere', async () => {
    const saveKey = vi.fn(async () => true)
    const node = render(
      <KeyRequest
        ports={ports({ saveKey })}
        cost={COST}
        onContinue={() => {}}
        onDismiss={() => {}}
      />,
    )

    click(buttonWith(node, t('onboarding.key.continue')))
    await flush()
    expect(node.textContent).toContain(t('onboarding.key.format.empty'))
    expect(saveKey).not.toHaveBeenCalled()

    type(node, 'sk-1')
    click(buttonWith(node, t('onboarding.key.continue')))
    await flush()
    expect(node.textContent).toContain(t('onboarding.key.format.too_short'))
    expect(saveKey).not.toHaveBeenCalled()
  })

  it('marks the milestone only once the key is really saved', async () => {
    const markRequested = vi.fn(async () => undefined)
    const onContinue = vi.fn()
    const node = render(
      <KeyRequest
        ports={ports({ markRequested })}
        cost={COST}
        onContinue={onContinue}
        onDismiss={() => {}}
      />,
    )

    type(node, 'sk-or-v1-abcdef123456')
    click(buttonWith(node, t('onboarding.key.continue')))
    await flush()

    expect(markRequested).toHaveBeenCalledTimes(1)
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('a refused save is not a milestone', async () => {
    const markRequested = vi.fn(async () => undefined)
    const node = render(
      <KeyRequest
        ports={ports({ saveKey: async () => false, markRequested })}
        cost={COST}
        onContinue={() => {}}
        onDismiss={() => {}}
      />,
    )

    type(node, 'sk-or-v1-abcdef123456')
    click(buttonWith(node, t('onboarding.key.continue')))
    await flush()

    expect(markRequested).not.toHaveBeenCalled()
    expect(node.textContent).toContain(t('build.error.save_failed'))
  })

  it('"Not now" costs the user nothing and leaves the step owed', () => {
    const markRequested = vi.fn(async () => undefined)
    const onDismiss = vi.fn()
    const node = render(
      <KeyRequest
        ports={ports({ markRequested })}
        cost={COST}
        onContinue={() => {}}
        onDismiss={onDismiss}
      />,
    )

    click(buttonWith(node, t('onboarding.key.not_now')))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(markRequested).not.toHaveBeenCalled()
  })
})
