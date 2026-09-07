// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createMockAdapter } from '@juxbly/browser'
import { mountFloatingBall } from './mount'
import { FloatingBall } from './FloatingBall'

/**
 * The stylesheets are read from disk rather than imported: vitest does not process CSS
 * imports by default (they arrive empty), and the assertions below are about the CSS
 * *text* — the same text the content script inlines into the shadow root. Vitest's cwd
 * is the repository root; the jsdom environment's `import.meta.url` is not `file:`-based,
 * so the path is built from it.
 */
const UI_SRC = join(process.cwd(), 'packages', 'ui', 'src')
const tokensCss = readFileSync(join(UI_SRC, 'tokens.css'), 'utf8')
const ballCss = readFileSync(join(UI_SRC, 'floating-ball', 'styles.css'), 'utf8')

/**
 * Floating ball DOM behaviour — `task/stage-1-8.md` Tests (DOM half; the pure state
 * machine lives in `tests/unit/ui/floating-ball/ball-state.test.ts`).
 *
 * AC 2 (idle dichotomy), AC 5 (shadow isolation), AC 6 (reduced motion), AC 8 (copy by
 * key) and the shortcut toggle path are asserted here; the purely visual checks (AC 3,
 * AC 7) stay with the manual acceptance table in `docs/testing/MANUAL_ACCEPTANCE.md`.
 */

let container: HTMLElement
let root: Root | undefined

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = undefined
  container.remove()
  vi.useRealTimers()
})

function mount(hasSavedTools: boolean): HTMLButtonElement {
  act(() => {
    root = createRoot(container)
    root.render(<FloatingBall hasSavedTools={hasSavedTools} />)
  })
  const ball = container.querySelector('.jx-ball')
  if (ball === null) throw new Error('ball did not mount')
  return ball as HTMLButtonElement
}

describe('idle dichotomy (AC 2)', () => {
  it('no tools: fully static — no pulse class', () => {
    const ball = mount(false)

    expect(ball.className).not.toContain('is-pulsing')
    expect(ball.getAttribute('data-state')).toBe('idle')
  })

  it('tools saved: the one-shot pulse plays once, then the element is quiet', () => {
    vi.useFakeTimers()
    const ball = mount(true)

    expect(ball.className).toContain('is-pulsing')

    // Past the pulse duration the class is gone and never comes back — no loop.
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(ball.className).not.toContain('is-pulsing')

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(ball.className).not.toContain('is-pulsing')
  })
})

describe('activation (AC 4: shortcut shares the mouse path)', () => {
  it('click advances idle → listening (the future panel toggle)', () => {
    const ball = mount(false)

    act(() => {
      ball.click()
    })
    expect(ball.getAttribute('data-state')).toBe('listening')
  })

  it('a relayed internal:command toggles via a real click on the same handler', () => {
    const adapter = createMockAdapter()
    act(() => {
      mountFloatingBall(container, { adapter, hasSavedTools: false })
    })
    const ball = container.querySelector('.jx-ball') as HTMLButtonElement
    expect(ball.getAttribute('data-state')).toBe('idle')

    act(() => {
      adapter.emitIncoming({ kind: 'internal:command', command: 'toggle-juxbly' })
    })
    expect(ball.getAttribute('data-state')).toBe('listening')

    // Toggle semantics: a second shortcut press collapses back.
    act(() => {
      adapter.emitIncoming({ kind: 'internal:command', command: 'toggle-juxbly' })
    })
    expect(ball.getAttribute('data-state')).toBe('idle')
  })

  it('ignores relayed commands it does not own', () => {
    const adapter = createMockAdapter()
    act(() => {
      mountFloatingBall(container, { adapter, hasSavedTools: false })
    })
    const ball = container.querySelector('.jx-ball') as HTMLButtonElement

    act(() => {
      adapter.emitIncoming({ kind: 'internal:command', command: 'something-else' })
    })
    expect(ball.getAttribute('data-state')).toBe('idle')
  })
})

describe('style isolation (AC 5: everything stays inside the shadow root)', () => {
  it('tokens.css addresses the shadow host, not the document root only', () => {
    // `:root` alone matches nothing inside a shadow root; the variables must ride on :host.
    expect(tokensCss).toContain(':root,\n:host')
  })

  it('ball styles declare no document-level selectors', () => {
    expect(ballCss).not.toMatch(/:root(?!,)/)
    expect(ballCss).not.toMatch(/^\s*(html|body)\b/m)
  })

  it('the component renders no inline styles and no raw colour values', () => {
    const markup = renderMarkup()

    expect(markup).not.toContain('style="')
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})

describe('accessibility (AC 6)', () => {
  it('reduced motion downgrades the pulse to a fade and stops the analysing loop', () => {
    // jsdom cannot apply media queries; the guarantee is asserted at the source level
    // and re-verified visually in MANUAL_ACCEPTANCE 1-8 #8.
    const reduced = ballCss.slice(ballCss.indexOf('prefers-reduced-motion'))

    expect(reduced).toContain('jx-once-pulse-fade')
    expect(reduced).toMatch(/animation:\s*none/)
  })

  it('carries a screen-reader label from the copy bundle', () => {
    expect(renderMarkup()).toContain('aria-label="Open Juxbly"')
  })
})

describe('copy discipline (AC 8: no hardcoded user-visible strings)', () => {
  it('labels come from the copy bundle, never as literals in the component', () => {
    const source = readFileSync(join(UI_SRC, 'floating-ball', 'FloatingBall.tsx'), 'utf8')

    expect(source).toContain('t(STATE_LABEL_KEYS[state])')
    expect(source).not.toMatch(/aria-label="/)
  })
})

function renderMarkup(): string {
  return renderToStaticMarkup(<FloatingBall hasSavedTools={false} />)
}
