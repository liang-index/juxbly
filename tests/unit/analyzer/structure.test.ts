// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { collectNodes, detectContainers, detectScrollHint, isInvisible } from '@juxbly/analyzer'

/**
 * Structural features — container candidates, field-level candidates and the scroll
 * signal.
 *
 * The selector policy is part of the contract: structure and stable attributes only. A
 * hashed class (CSS-in-JS output) changes on the next deploy, and a selector built from
 * one is guaranteed to break — that is a known hard problem, not something to paper over
 * by emitting one anyway.
 */
function elementsOf(html: string): Element[] {
  document.body.innerHTML = html
  const walk = collectNodes(document.body, { skip: isInvisible })
  return walk.nodes.filter((node): node is Element => node.nodeType === 1)
}

describe('detectContainers', () => {
  it('finds a repeating unit by sibling groups, not by tag name alone', () => {
    const containers = detectContainers(elementsOf('<ul><li>a</li><li>b</li><li>c</li></ul>'))

    expect(containers).toHaveLength(1)
    expect(containers[0]?.hitCount).toBe(3)
    expect(containers[0]?.tagPath).toContain('li')
  })

  it('ignores a group that is too small to be a pattern', () => {
    expect(detectContainers(elementsOf('<ul><li>a</li><li>b</li></ul>'))).toEqual([])
  })

  it('prefers the whole repeating unit over one element inside it', () => {
    // Three cards, three rows each: the card is the unit the model should be offered, not
    // the rows — and not both, which would double the work in 1-9 for no gain.
    const containers = detectContainers(
      elementsOf(
        '<div id="list">' +
          '<div class="card"><div class="row">1</div><div class="row">2</div><div class="row">3</div></div>' +
          '<div class="card"><div class="row">4</div><div class="row">5</div><div class="row">6</div></div>' +
          '<div class="card"><div class="row">7</div><div class="row">8</div><div class="row">9</div></div>' +
          '</div>',
      ),
    )

    expect(containers).toHaveLength(1)
    expect(containers[0]?.tagPath).toContain('div')
    expect(containers[0]?.hitCount).toBe(3)
  })

  it('never builds a selector on a hashed class', () => {
    const containers = detectContainers(
      elementsOf(
        '<ul>' +
          '<li><span class="css-1x2y3z4">one</span></li>' +
          '<li><span class="css-1x2y3z4">two</span></li>' +
          '<li><span class="css-1x2y3z4">three</span></li>' +
          '</ul>',
      ),
    )

    const hint = containers[0]?.fieldHints[0]?.selector ?? ''
    expect(hint).not.toContain('css-')
  })

  it('gives each column of a row its own field hint', () => {
    const containers = detectContainers(
      elementsOf(
        '<table><tbody>' +
          '<tr><td>Apple</td><td>1.20</td></tr>' +
          '<tr><td>Banana</td><td>0.80</td></tr>' +
          '<tr><td>Cherry</td><td>2.40</td></tr>' +
          '</tbody></table>',
      ),
    )

    const selectors = containers[0]?.fieldHints.map((hint) => hint.selector) ?? []
    expect(selectors).toEqual(['td:nth-of-type(1)', 'td:nth-of-type(2)'])
    expect(containers[0]?.fieldHints[0]?.sampleText).toBe('Apple')
  })

  it('truncates long sample text', () => {
    const long = 'y'.repeat(200)
    const containers = detectContainers(
      elementsOf(`<ul><li><span>${long}</span></li><li><span>${long}</span></li><li><span>${long}</span></li></ul>`),
    )

    const sample = containers[0]?.fieldHints[0]?.sampleText ?? ''
    expect(sample.length).toBeLessThan(60)
    expect(sample.endsWith('...')).toBe(true)
  })
})

describe('detectScrollHint', () => {
  it('reports nothing for a static page', () => {
    expect(detectScrollHint(elementsOf('<div><p>nothing to load</p></div>'))).toBe('none')
  })

  it('recognises a load-more control', () => {
    const html = '<ul><li>a</li><li>b</li><li>c</li></ul><button>Load more</button>'

    expect(detectScrollHint(elementsOf(html))).toBe('load_more')
  })

  it('recognises an infinite-scroll sentinel', () => {
    const html = '<ul><li>a</li><li>b</li><li>c</li></ul><div class="infinite-scroll-loader"></div>'

    expect(detectScrollHint(elementsOf(html))).toBe('infinite')
  })

  it('prefers the explicit control when both signals are present', () => {
    const html = '<div class="sentinel"></div><button aria-label="Show more results">+</button>'

    expect(detectScrollHint(elementsOf(html))).toBe('load_more')
  })
})
