// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { t } from '../copy'
import { PromiseLine } from './promise-line'

/**
 * Node ④ — the first-build notice, `task/stage-1-13.md` AC 1, `docs/UI_SPEC.md` §7.3 ④.
 *
 * The notice is not a banner and not a second sentence: it is the promise line's *full*
 * wording, and it appears exactly once because the flag behind it is written by the first
 * successful run (stage 1-10) and never rewritten. Two assertions matter and a screenshot
 * would settle neither:
 *
 *   - the first run says the whole thing ("this shows up automatically"), because nothing
 *     else in the UI has told the user the tool was kept;
 *   - every run after that says the short version, because a promise repeated forever
 *     stops being a promise and becomes a nag.
 */
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

describe('promise line (onboarding node ④)', () => {
  it('says the whole thing while the first build has not happened', () => {
    const node = render(<PromiseLine firstToolBuilt={false} />)

    expect(node.textContent).toContain(t('run.promise.first'))
    expect(node.textContent).not.toContain(t('run.promise.recurring'))
  })

  it('shrinks to a statement of fact once a tool has run — and never grows back', () => {
    const node = render(<PromiseLine firstToolBuilt />)

    expect(node.textContent).toContain(t('run.promise.recurring'))
    expect(node.textContent).not.toContain(t('run.promise.first'))
  })

  it('is one line, not a dialog and not a banner', () => {
    const node = render(<PromiseLine firstToolBuilt={false} />)

    expect(node.querySelectorAll('[role="dialog"], dialog').length).toBe(0)
    expect(node.querySelectorAll('button').length).toBe(0)
  })
})
