// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HighlightLayer } from './HighlightLayer'
import { MAX_HIGHLIGHT_ROWS, collectHighlightTargets, remeasureTargets } from './highlight-layer'
import type { HighlightQuery } from './highlight-layer'
import {
  GLOW_MS,
  REDUCED_GLOW_MS,
  STAGGER_MS,
  glowDelayMs,
  glowDurationMs,
  parseMs,
  prefersReducedMotion,
} from './glow'
import type { ProposalField } from '../build/proposal'

/**
 * Highlight layer — `task/stage-1-9.md` Tests (DOM half).
 *
 * The assertions that matter are the ones about **truthfulness** and **isolation**: a box
 * is only drawn where the selector actually matched, the host page is never mutated, and
 * the timing constants still agree with `tokens.css`. The purely visual result (does it
 * *look* like a green glow) stays with the manual acceptance table.
 */

const UI_SRC = join(process.cwd(), 'packages', 'ui', 'src')
const tokensCss = readFileSync(join(UI_SRC, 'tokens.css'), 'utf8')

/** The first duration in a motion token: "600ms cubic-bezier(...)" → 600. */
function tokenMs(name: string): number {
  const declaration = new RegExp(`--jx-${name}:\\s*([^;]+);`).exec(tokensCss)
  if (declaration === null) throw new Error(`missing token --jx-${name}`)
  const duration = /([0-9.]+ms)/.exec(declaration[1] ?? '')
  return duration === null ? Number.NaN : parseMs(duration[1] ?? '')
}

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
  vi.unstubAllGlobals()
})

/**
 * A page that answers selectors the way a real one would: `jsdom` gives every element a
 * zero rect, so the rects are stubbed to make the positioning observable.
 */
function stubPage(): { query: HighlightQuery; host: HTMLElement } {
  const host = document.createElement('div')
  host.innerHTML = `
    <div class="row"><h3 class="title">A</h3><span class="price">$1</span></div>
    <div class="row"><h3 class="title">B</h3><span class="price">$2</span></div>
  `
  document.body.append(host)

  const query: HighlightQuery = (selector, scope) => {
    const root: ParentNode = scope ?? host
    return Array.from(root.querySelectorAll(selector)).map((element, index) => {
      const rect = {
        x: 0,
        y: index * 20,
        top: index * 20,
        left: 5,
        width: 100,
        height: 20,
        right: 105,
        bottom: index * 20 + 20,
        toJSON: () => ({}),
      }
      element.getBoundingClientRect = () => rect as DOMRect
      return element
    })
  }

  return { query, host }
}

/** A rect below the fold: the case where the user cannot see what they are confirming. */
function belowViewport(): DOMRect {
  return {
    x: 0,
    y: 4000,
    top: 4000,
    left: 5,
    width: 100,
    height: 20,
    right: 105,
    bottom: 4020,
    toJSON: () => ({}),
  } as DOMRect
}

function fields(): ProposalField[] {
  return [
    { field: 'title', selector: '.title', type: 'text' },
    { field: 'price', selector: '.price', type: 'text' },
  ]
}

describe('collectHighlightTargets', () => {
  it('draws a box only where the selector matched — a neighbour is not a match', () => {
    const { query, host } = stubPage()

    const targets = collectHighlightTargets(
      [...fields(), { field: 'rating', selector: '.rating', type: 'text' }],
      '.row',
      query,
    )

    // Two rows × two fields; `rating` matches nothing and gets no box. Highlighting the
    // closest neighbour instead would be a claim about what the tool will extract.
    expect(targets.map((target) => target.field)).toEqual(['title', 'price', 'title', 'price'])
    expect(targets.every((target) => target.rect.height > 0)).toBe(true)
    host.remove()
  })

  it('caps the rows it lights up: confirmation is not a census', () => {
    const { query, host } = stubPage()
    for (let index = 0; index < 20; index += 1) {
      const row = document.createElement('div')
      row.className = 'row'
      row.innerHTML = '<h3 class="title">A</h3>'
      host.append(row)
    }

    const targets = collectHighlightTargets([fields()[0] as ProposalField], '.row', query)

    expect(targets).toHaveLength(MAX_HIGHLIGHT_ROWS)
    host.remove()
  })

  it('reads single mode against the document, not a container (§5.2)', () => {
    const { query, host } = stubPage()
    const scoped: HighlightQuery = (selector, scope) => {
      expect(scope).toBeUndefined()
      return query(selector)
    }

    const targets = collectHighlightTargets(fields(), null, scoped)

    expect(targets.map((target) => target.field)).toEqual(['title', 'price'])
    host.remove()
  })

  it('re-measures to the same fields at their current positions', () => {
    const { query, host } = stubPage()
    const first = collectHighlightTargets(fields(), '.row', query)

    const remeasured = remeasureTargets(first, '.row', query)

    expect(remeasured.map((target) => target.field)).toEqual(first.map((target) => target.field))
    host.remove()
  })
})

describe('glow timing', () => {
  it('restates the tokens, not a second opinion', () => {
    expect(tokenMs('motion-signature')).toBe(GLOW_MS)
    expect(tokenMs('stagger')).toBe(STAGGER_MS)
    expect(parseMs('70ms')).toBe(70)
  })

  it('staggers the boxes, and collapses the stagger under reduced motion', () => {
    expect(glowDelayMs(0, false)).toBe(0)
    expect(glowDelayMs(3, false)).toBe(3 * STAGGER_MS)
    expect(glowDelayMs(3, true)).toBe(0)
    expect(glowDurationMs(false)).toBe(GLOW_MS)
    expect(glowDurationMs(true)).toBe(REDUCED_GLOW_MS)
  })

  it('reads the host preference, and defaults to "no preference" without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersReducedMotion()).toBe(false)

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    expect(prefersReducedMotion()).toBe(true)
  })
})

describe('HighlightLayer', () => {
  function render(props: Partial<Parameters<typeof HighlightLayer>[0]> = void 0 as never) {
    const { query, host } = stubPage()
    act(() => {
      root = createRoot(container)
      root.render(
        <HighlightLayer
          fields={fields()}
          containerSelector=".row"
          query={query}
          token={0}
          {...props}
        />,
      )
    })
    return { host }
  }

  it('draws one box per match, positioned from the rect', () => {
    const { host } = render()

    const boxes = container.querySelectorAll<HTMLButtonElement>('.jx-highlight')
    expect(boxes).toHaveLength(4)
    expect(boxes[0]?.dataset.field).toBe('title')
    expect(boxes[0]?.style.top).toBe('0px')
    expect(boxes[1]?.style.top).toBe('0px')
    expect(boxes[1]?.style.left).toBe('5px')
    // The stagger is what makes the sequence read top to bottom.
    expect(boxes[2]?.style.animationDelay).toBe(`${2 * STAGGER_MS}ms`)
    host.remove()
  })

  it('never mutates the host page', () => {
    const { host } = render()
    const before = host.outerHTML

    act(() => {
      root?.render(
        <HighlightLayer fields={fields()} containerSelector=".row" query={() => []} token={1} />,
      )
    })

    expect(host.outerHTML).toBe(before)
    expect(host.querySelector('.jx-highlight')).toBeNull()
    host.remove()
  })

  it('scrolls the first box into view when none is visible, and only once', () => {
    const { query, host } = stubPage()
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    // Every row starts below the fold.
    const belowFold: HighlightQuery = (selector, scope) =>
      query(selector, scope).map((element) => {
        element.getBoundingClientRect = () => belowViewport()
        return element
      })

    act(() => {
      root = createRoot(container)
      root.render(<HighlightLayer fields={fields()} containerSelector=".row" query={belowFold} token={0} />)
    })

    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollBy.mock.calls[0]?.[0]).toMatchObject({ behavior: 'smooth' })

    // A re-measure must not take the scroll position back: the user may have moved it.
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(scrollBy).toHaveBeenCalledTimes(1)

    scrollBy.mockRestore()
    host.remove()
  })

  it('marks the field being corrected, and disables the boxes while picking', () => {
    const { host } = render({ pickingField: 'price', disabled: true })

    const picking = container.querySelectorAll<HTMLButtonElement>('.jx-highlight.is-picking')
    expect(picking).toHaveLength(2)
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>('.jx-highlight')).every(
        (box) => box.disabled,
      ),
    ).toBe(true)
    host.remove()
  })
})
