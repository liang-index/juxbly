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

describe('the ":self" field selector', () => {
  it('reads the container itself in list mode', () => {
    // The container is never among its own querySelectorAll matches, so "the value is this
    // element" is only expressible as :self (§5.2). The benchmark showed the model writing
    // "" or ":self" for it anyway, and both used to fail the whole step.
    const host = createFixtureHost('list-page.html')

    const outcome = extractList(
      host.dom,
      step({ mode: 'list', selector: '.results li.product', fields: { whole: ':self', title: '.title' } }),
    )

    expect(outcome.records[0]).toEqual({ whole: 'Wireless keyboard $49.00 4.6', title: 'Wireless keyboard' })
  })

  it('reads the container itself in single mode', () => {
    const host = createFixtureHost('single-record.html')

    const outcome = extractSingle(
      host.dom,
      step({ mode: 'single', selector: '.profile', fields: { whole: ':self' } }),
    )

    expect(outcome.records).toEqual([{ whole: 'Ada Lovelace Research lead London' }])
  })

  it('is empty rather than the whole document when there is no container', () => {
    // The dangerous reading would be the document root: its text is the entire page, and a
    // field that returns the page would look like a value instead of a bug.
    const host = createFixtureHost('list-page.html')

    const outcome = extractSingle(host.dom, step({ mode: 'single', fields: { page: ':self' } }))

    expect(outcome.records).toEqual([{ page: '' }])
    expect(summarizeFields(outcome.records, ['page']).missingFields).toEqual(['page'])
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

/**
 * `attr` through a whole list extract — the repair for the case dogfooding found.
 *
 * On books.toscrape the star rating lives in the element's `class` and the untruncated
 * title in `title=`; read as text both columns come back wrong (one empty, one clipped).
 * The point of these two assertions is that the fix is real end to end, not just inside
 * `readFieldValue`: `fieldPresence` has to report the field as present, because that is
 * what health and the panel read.
 */
/**
 * `attr` through a whole list extract — the repair for the case dogfooding found.
 *
 * On books.toscrape the star rating lives in the element's `class` and the untruncated
 * book title in `title=`; read as text both columns come back wrong — one empty, one
 * clipped. The page shape below is that one, rebuilt small.
 */
function bookShelf() {
  const host = createFixtureHost('list-page.html')
  const shelf = host.document.createElement('div')

  for (const [stars, full] of [
    ['Three', 'A Light in the Attic'],
    ['One', 'Tipping the Velvet'],
  ] as const) {
    const book = host.document.createElement('article')
    book.className = 'book'

    const rating = host.document.createElement('p')
    rating.className = `star-rating ${stars}`

    const link = host.document.createElement('a')
    link.setAttribute('title', full)
    link.textContent = `${full.slice(0, 10)}...`

    book.append(link, rating)
    shelf.append(book)
  }

  host.document.body.append(shelf)
  return host
}

describe('attr through a list extract', () => {
  const selector = 'div article.book'
  const fields = { rating: 'p.star-rating', title: 'a' }

  it('fills both columns the three text types could not', () => {
    const outcome = extractList(
      bookShelf().dom,
      step({
        mode: 'list',
        selector,
        fields,
        field_types: { rating: 'attr', title: 'attr' },
        field_attrs: { rating: 'class', title: 'title' },
      }),
    )

    expect(outcome.hitCount).toBe(2)
    expect(outcome.records[0]?.['rating']).toBe('star-rating Three')
    expect(outcome.records[0]?.['title']).toBe('A Light in the Attic')
    expect(outcome.records[1]?.['rating']).toBe('star-rating One')
  })

  it('reports the rating as present, where reading it as text reported it missing', () => {
    // Presence is what health and the panel read, so this is the assertion that says the
    // fix is real end to end rather than only inside readFieldValue.
    const host = bookShelf()

    const asAttr = extractList(
      host.dom,
      step({ mode: 'list', selector, fields, field_types: { rating: 'attr', title: 'attr' }, field_attrs: { rating: 'class', title: 'title' } }),
    )
    const asText = extractList(host.dom, step({ mode: 'list', selector, fields }))

    expect(summarizeFields(asAttr.records, Object.keys(fields)).missingFields).toEqual([])
    expect(summarizeFields(asText.records, Object.keys(fields)).missingFields).toEqual(['rating'])
  })

  it('still reads a value below the cap when the attribute is refused', () => {
    // A refused credential slot must not fail the run: it is one empty field, reported as
    // missing like any other.
    const host = bookShelf()
    const outcome = extractList(
      host.dom,
      step({ mode: 'list', selector, fields, field_types: { rating: 'attr' }, field_attrs: { rating: 'data-api-key' } }),
    )

    expect(outcome.hitCount).toBe(2)
    expect(outcome.records[0]?.['rating']).toBe('')
  })
})
