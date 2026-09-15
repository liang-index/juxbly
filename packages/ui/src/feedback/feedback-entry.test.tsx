// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../copy'
import { browserLabelOf, diagnosticLine, FeedbackEntry } from './feedback-entry'

/**
 * The feedback entry — `task/stage-1-16.md` Scope 7 / Tests, AC 6.
 *
 * The assertion that gives this component its shape is the zero-collection one:
 * **opening and using the entry performs no network request of any kind.** That is why
 * the component is text and links — no icon font, no remote image, no fetch on click.
 *
 * The second half: the diagnostic line is the *only* thing the product assembles, it is
 * shown before it is copied, and the copy is a user click with the line and nothing
 * else — no tool name, no page URL, no definition.
 */
let container: HTMLElement
let root: Root | undefined

const originalFetch = globalThis.fetch

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)

  // Not a spy but a trap: if any code path in the entry reaches for the network, the
  // test fails loudly instead of quietly succeeding because fetch was never called.
  ;(globalThis as { fetch?: unknown }).fetch = () => {
    throw new Error('feedback entry must not use fetch')
  }
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = undefined
  container.remove()
  ;(globalThis as { fetch?: unknown }).fetch = originalFetch
})

function render(node: ReactNode): HTMLElement {
  act(() => {
    root = createRoot(container)
    root.render(node)
  })
  return container
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('feedback entry (AC 6)', () => {
  it('opens with zero network activity — text and links only', () => {
    const node = render(<FeedbackEntry version="0.4.2" runtime="Chrome 138" />)

    // fetch is mocked to throw, so merely surviving this render is the assertion.
    expect(node.querySelectorAll('img, iframe, link[rel="preload"]')).toHaveLength(0)
  })

  it('covers both kinds of feedback (PRODUCT §9.2) as two plain links', () => {
    const node = render(<FeedbackEntry version="0.4.2" runtime="Chrome 138" />)

    const links = [...node.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'))
    expect(links).toHaveLength(2)
    expect(node.textContent).toContain(t('options.feedback.problem'))
    expect(node.textContent).toContain(t('options.feedback.scenario'))
  })

  it('attaches nothing to the destinations — no tool name, no page URL', () => {
    const node = render(
      <FeedbackEntry version="0.4.2" runtime="Chrome 138" />,
    )

    for (const anchor of node.querySelectorAll('a')) {
      const href = anchor.getAttribute('href') ?? ''
      expect(href.startsWith('https://github.com/liang-index/juxbly/')).toBe(true)
      expect(href.includes('body=') || href.includes('title=')).toBe(false)
    }
  })

  it('shows the diagnostic line and copies exactly it — nothing assembled around it', async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    const node = render(
      <FeedbackEntry version="0.4.2" runtime="Chrome 138" copy={copy} />,
    )

    const line = diagnosticLine({ version: '0.4.2', runtime: 'Chrome 138' })
    expect(node.querySelector('.jx-feedback-line')?.textContent).toBe(line)

    await click([...node.querySelectorAll('button')][0] as Element)

    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledWith(line)
    expect(node.textContent).toContain(t('options.feedback.copied'))
  })

  it('says so when the copy did not go through, and points at the line', async () => {
    const copy = vi.fn().mockRejectedValue(new Error('denied'))
    const node = render(<FeedbackEntry version="0.4.2" runtime="Chrome 138" copy={copy} />)

    await click([...node.querySelectorAll('button')][0] as Element)

    expect(node.textContent).toContain(t('options.feedback.copy_failed'))
    expect(node.querySelector('.jx-feedback-line')?.textContent).not.toBe('')
  })
})

describe('browserLabelOf', () => {
  it('reads the Chrome major version, and answers null when the agent says nothing', () => {
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

    expect(browserLabelOf(chrome)).toBe('Chrome 138')
    expect(browserLabelOf('not a user agent')).toBeNull()
  })
})
