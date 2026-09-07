// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CapabilityError, MAX_ITEMS, extractList, extractSingle, summarizeFields } from '@juxbly/capabilities'
import type { ExtractStep } from '@juxbly/dsl'
import { createFixtureHost } from '../../../fixtures/page-host'

/**
 * The two modes, and the one thing that matters more than either: a selector that matched
 * nothing and a selector that cannot be parsed must never look the same. Health puts them
 * on different layers (§10), so collapsing them here would make every "the page changed"
 * read as "the tool is broken".
 */
function step(partial: Omit<ExtractStep, 'type' | 'output_to'>): ExtractStep {
  return { type: 'extract', output_to: 'rows', ...partial }
}

describe('extractList', () => {
  it('produces one record per container, with the fields read inside it', () => {
    const host = createFixtureHost('list-page.html')

    const outcome = extractList(
      host.dom,
      step({ mode: 'list', selector: '.results li.product', fields: { title: '.title', price: '.price' } }),
    )

    expect(outcome.hitCount).toBe(4)
    expect(outcome.truncated).toBe(false)
    expect(outcome.records).toEqual([
      { title: 'Wireless keyboard', price: '$49.00' },
      { title: 'Wireless mouse', price: '$29.00' },
      { title: 'USB-C hub', price: '$39.00' },
      { title: 'Laptop stand', price: '$59.00' },
    ])
  })

  it('refuses to run without a container selector', () => {
    // §5.4 rule 4 rejects this before the tool is ever saved; a capability is also
    // callable directly, so it holds the same line.
    const host = createFixtureHost('list-page.html')

    expect(() => extractList(host.dom, step({ mode: 'list', fields: { title: '.title' } }))).toThrow(
      CapabilityError,
    )
  })
})

describe('extractSingle', () => {
  it('reads the fields inside the optional container', () => {
    const host = createFixtureHost('single-record.html')

    const outcome = extractSingle(
      host.dom,
      step({ mode: 'single', selector: '.profile', fields: { name: '.name', role: '.role' } }),
    )

    expect(outcome.hitCount).toBe(1)
    expect(outcome.records).toEqual([{ name: 'Ada Lovelace', role: 'Research lead' }])
  })

  it('reads against the document root when no container is given', () => {
    const host = createFixtureHost('single-record.html')

    const outcome = extractSingle(host.dom, step({ mode: 'single', fields: { name: '.name' } }))

    expect(outcome.hitCount).toBe(1)
    expect(outcome.records).toEqual([{ name: 'Ada Lovelace' }])
  })
})

describe('zero hits and broken selectors', () => {
  it('reports zero hits as an answer, not an error', () => {
    const host = createFixtureHost('list-page.html')

    const outcome = extractList(
      host.dom,
      step({ mode: 'list', selector: '.results li.nope', fields: { title: '.title' } }),
    )

    expect(outcome.hitCount).toBe(0)
    expect(outcome.records).toEqual([])
    expect(summarizeFields(outcome.records, ['title']).missingFields).toEqual(['title'])
  })

  it('reports an unparseable selector as SELECTOR_SYNTAX', () => {
    const host = createFixtureHost('list-page.html')

    try {
      extractList(host.dom, step({ mode: 'list', selector: 'li[[[', fields: { title: '.title' } }))
      expect.unreachable('an invalid selector must not be treated as zero hits')
    } catch (error) {
      expect((error as CapabilityError).code).toBe('SELECTOR_SYNTAX')
    }
  })
})

describe('summarizeFields', () => {
  it('counts a field as missing only when it hit nothing in every record', () => {
    const host = createFixtureHost('list-page.html')
    host.document.querySelector('.rating')?.remove()

    const outcome = extractList(
      host.dom,
      step({ mode: 'list', selector: '.results li.product', fields: { title: '.title', rating: '.rating' } }),
    )
    const { fieldPresence, missingFields } = summarizeFields(outcome.records, ['title', 'rating'])

    expect(fieldPresence).toEqual({ title: 1, rating: 0.75 })
    expect(missingFields).toEqual([])
  })

  it('marks a field missing when no record has it', () => {
    const host = createFixtureHost('list-page.html')
    for (const node of Array.from(host.document.querySelectorAll('.rating'))) node.remove()

    const outcome = extractList(
      host.dom,
      step({ mode: 'list', selector: '.results li.product', fields: { title: '.title', rating: '.rating' } }),
    )
    const { fieldPresence, missingFields } = summarizeFields(outcome.records, ['title', 'rating'])

    expect(fieldPresence).toEqual({ title: 1, rating: 0 })
    expect(missingFields).toEqual(['rating'])
  })
})

describe('the container cap', () => {
  it('truncates instead of handing the host page tens of thousands of rows', () => {
    const host = createFixtureHost('list-page.html')
    const list = host.document.querySelector('.results')
    for (let index = 0; index < MAX_ITEMS + 1; index += 1) {
      const row = host.document.createElement('li')
      row.className = 'product'
      const title = host.document.createElement('span')
      title.className = 'title'
      title.textContent = `row ${String(index)}`
      row.append(title)
      list?.append(row)
    }

    const outcome = extractList(
      host.dom,
      step({ mode: 'list', selector: '.results li.product', fields: { title: '.title' } }),
    )

    expect(outcome.records).toHaveLength(MAX_ITEMS)
    // The real hit count survives the cap: capping must not look like a page that changed.
    expect(outcome.hitCount).toBe(MAX_ITEMS + 5)
    expect(outcome.truncated).toBe(true)
  })
})
