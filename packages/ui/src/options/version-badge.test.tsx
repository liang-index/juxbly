// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { t } from '../copy'
import { VersionBadge } from './version-badge'

/**
 * The version identity — `task/stage-1-16.md` Scope 5 / Tests, AC 4.
 *
 * AC 4's second half ("not a brand slot") is a structural claim, so it gets a structural
 * assertion: the badge is a paragraph, is not a link, contains no image, and carries no
 * heading. A logo, a link or a heading could be added later without touching this test —
 * which is exactly why the test must fail when one of them appears.
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

describe('version badge (AC 4)', () => {
  it('names the build in text-meta', () => {
    const node = render(<VersionBadge version="0.4.2" />)

    const badge = node.querySelector('.jx-options-version')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toBe(t('options.version.badge', { version: '0.4.2' }))
  })

  it('is a plain paragraph — no link, no image, no heading role', () => {
    const node = render(<VersionBadge version="0.4.2" />)

    const badge = node.querySelector('.jx-options-version')
    expect(badge?.tagName).toBe('P')
    expect(badge?.querySelector('a, img, svg')).toBeNull()
    expect(badge?.getAttribute('role')).toBeNull()
    expect(badge?.closest('a')).toBeNull()
  })
})
