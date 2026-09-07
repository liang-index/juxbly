// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { classifyQueryError, queryAll } from '@juxbly/capabilities'
import { loadFixturePage } from '../../../fixtures/page-host'

/**
 * `queryAll` is the reference implementation a host backs `DomPort.query` with, so these
 * tests are the definition of "piercing shadow DOM" for the whole repository: what passes
 * here is what extract, and later the §5.6 candidate dry-run, will see.
 */
describe('queryAll', () => {
  it('finds the repeating units inside an open shadow root', () => {
    const document = loadFixturePage('shadow-list.html')

    const rows = queryAll(document, 'li.item')

    expect(rows).toHaveLength(3)
  })

  it('finds a field through a second shadow root nested inside the row', () => {
    const document = loadFixturePage('shadow-list.html')

    const prices = queryAll(document, '.price').map((element) => element.textContent)

    expect(prices).toEqual(['$49.00', '$29.00', '$39.00'])
  })

  it('never sees inside a closed root', () => {
    const document = loadFixturePage('shadow-custom-elements.html')

    expect(queryAll(document, '.secret')).toHaveLength(0)
    // The open roots on the same page are still there, so the fixture is not simply empty.
    expect(queryAll(document, '.title').length).toBeGreaterThan(0)
  })

  it('returns light-DOM matches before shadow matches, each group in document order', () => {
    const host = document.createElement('div')
    host.id = 'host'
    const outerA = element('span', 'x', 'outer-a')
    const outerB = element('span', 'x', 'outer-b')
    host.append(outerA, outerB)
    document.body.append(host)

    const root = host.attachShadow({ mode: 'open' })
    root.append(element('span', 'x', 'inner-a'), element('span', 'x', 'inner-b'))

    const ids = queryAll(document, '.x').map((element) => element.textContent)

    // Not strict document order — a shadow interior sits at its host — but fixed, so a
    // selector that matches across a boundary resolves the same way on every run.
    expect(ids).toEqual(['outer-a', 'outer-b', 'inner-a', 'inner-b'])
  })

  it('scopes a query to the given element', () => {
    const document = loadFixturePage('shadow-list.html')
    const [first] = queryAll(document, 'li.item')
    expect(first).toBeDefined()

    const titles = queryAll(first as Element, '.title').map((element) => element.textContent)

    expect(titles).toEqual(['Wireless keyboard'])
  })

  it('throws on an invalid selector instead of returning nothing', () => {
    const document = loadFixturePage('list-page.html')

    expect(() => queryAll(document, 'li[[[')).toThrow()
  })
})

describe('classifyQueryError', () => {
  it('maps an invalid selector to SELECTOR_SYNTAX', () => {
    let caught: unknown
    try {
      document.querySelectorAll('li[[[')
    } catch (error) {
      caught = error
    }

    expect(classifyQueryError(caught).code).toBe('SELECTOR_SYNTAX')
  })

  it('maps any other DOM failure to DOM_UNAVAILABLE', () => {
    expect(classifyQueryError(new Error('the page went away')).code).toBe('DOM_UNAVAILABLE')
  })

  it('carries a generic message, never the selector or anything from the page', () => {
    // A selector is generated from page text often enough that echoing it would leak page
    // content into logs.
    const error = classifyQueryError(new DOMException("'li[[[' is not a valid selector", 'SyntaxError'))

    expect(error.message).toBe('a selector is not valid CSS')
  })
})

function element(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}
