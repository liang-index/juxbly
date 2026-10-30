// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFieldValue } from '@juxbly/capabilities'
import { loadFixturePage } from '../../../fixtures/page-host'

/**
 * Attribute reading, not text: an `<img>` has no text and an `<a>` has the wrong one, so
 * `image` and `link` have to read attributes (PRODUCT §4.3).
 *
 * The fixture sets `<base href="https://shop.example.com/">`, which is what makes the
 * absolute-URL expectation stable instead of depending on the test runner's URL.
 */
function mixedFields(): { card(index: number): Element; document: Document } {
  const document = loadFixturePage('mixed-fields.html')
  const cards = Array.from(document.querySelectorAll('.cards li.card'))
  return {
    document,
    card: (index) => {
      const card = cards[index]
      if (card === undefined) throw new Error(`fixture has no card ${String(index)}`)
      return card
    },
  }
}

function fieldOf(card: Element, selector: string): Element {
  const found = card.querySelector(selector)
  if (found === null) throw new Error(`${selector} not found in the fixture card`)
  return found
}

describe('readFieldValue: text', () => {
  it('collapses whitespace', () => {
    const { document } = mixedFields()
    const node = document.createElement('span')
    node.textContent = '  Alpine\n  tent  '

    expect(readFieldValue(node, 'text')).toBe('Alpine tent')
  })
})

describe('readFieldValue: image', () => {
  it('reads src and alt', () => {
    const { card } = mixedFields()

    expect(readFieldValue(fieldOf(card(0), '.thumb'), 'image')).toEqual({
      src: 'https://shop.example.com/img/tent.jpg',
      alt: 'Alpine tent',
    })
  })

  it('falls back to the first srcset candidate and reports an empty alt', () => {
    const { card } = mixedFields()

    // No `src` and no `alt` attribute at all: the fallback is the only source, and a
    // missing alt is `''` rather than an absent key.
    expect(readFieldValue(fieldOf(card(1), '.thumb'), 'image')).toEqual({
      src: 'https://shop.example.com/img/stove-2x.jpg',
      alt: '',
    })
  })

  it('has no value when neither src nor srcset is present', () => {
    const { document } = mixedFields()
    const image = document.createElement('img')
    document.body.append(image)

    expect(readFieldValue(image, 'image')).toEqual({ src: '', alt: '' })
  })
})

describe('readFieldValue: link', () => {
  it('resolves a relative href against the document base', () => {
    const { card } = mixedFields()

    expect(readFieldValue(fieldOf(card(0), '.detail'), 'link')).toBe(
      'https://shop.example.com/p/alpine-tent',
    )
  })

  it('leaves an absolute href alone', () => {
    const { card } = mixedFields()

    expect(readFieldValue(fieldOf(card(1), '.detail'), 'link')).toBe(
      'https://shop.example.com/p/trail-stove',
    )
  })

  it('passes javascript: through unchanged, for the render layer to refuse', () => {
    // Inventing a URL here would be worse than handing the original over; turning it into
    // a clickable link is the render layer's decision (§5.2 Edge Cases).
    const { card } = mixedFields()

    expect(readFieldValue(fieldOf(card(2), '.detail'), 'link')).toBe('javascript:void(0)')
  })

  it('has no value when there is no href', () => {
    const { document } = mixedFields()
    const anchor = document.createElement('a')
    document.body.append(anchor)

    expect(readFieldValue(anchor, 'link')).toBe('')
  })
})

/**
 * `attr` — reading a named attribute.
 *
 * Added after a dogfooding run: books.toscrape carries its star rating as a CSS class and
 * keeps the untruncated book title in `title=`, and neither is reachable by `text`. The
 * evidence is in `tests/benchmark/reports/dogfood-2026-10-30.md`.
 */
describe('readFieldValue: attr', () => {
  function elementWith(attributes: Record<string, string>): Element {
    const { document } = mixedFields()
    const node = document.createElement('p')
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value)
    document.body.append(node)
    return node
  }

  it('reads the named attribute instead of the text node', () => {
    const node = elementWith({ class: 'star-rating Three' })

    expect(readFieldValue(node, 'attr', 'class')).toBe('star-rating Three')
  })

  it('reads a class-encoded value the three text types cannot reach', () => {
    // The case that motivated the type: the text node is empty, so `text` returns ''.
    const node = elementWith({ class: 'star-rating Three' })

    expect(readFieldValue(node, 'text')).toBe('')
    expect(readFieldValue(node, 'attr', 'class')).toBe('star-rating Three')
  })

  it('reads title, the way a page keeps a value it truncated in the text', () => {
    const node = elementWith({ title: 'A Light in the Attic' })
    node.textContent = 'A Light in the ...'

    expect(readFieldValue(node, 'attr', 'title')).toBe('A Light in the Attic')
  })

  it('is empty when the attribute is absent', () => {
    const node = elementWith({ class: 'star-rating' })

    expect(readFieldValue(node, 'attr', 'title')).toBe('')
  })

  it('is empty when no attribute was named — never guesses one', () => {
    // Validation rejects this shape (FIELD_ATTR_REQUIRED). Reaching here anyway must not
    // silently fall back to text or to "the first attribute".
    const node = elementWith({ title: 'full title' })
    node.textContent = 'truncated'

    expect(readFieldValue(node, 'attr')).toBe('')
  })

  it('refuses an attribute whose name marks a credential slot', () => {
    const node = elementWith({ 'data-algolia-key': 'abc123', 'data-index': 'products' })

    expect(readFieldValue(node, 'attr', 'data-algolia-key')).toBe('')
    expect(readFieldValue(node, 'attr', 'data-index')).toBe('products')
  })

  it('still permits hash — the narrowed rule the corpus check uses', () => {
    // `data-css-hash` is bookkeeping no scanner objects to; including it would refuse
    // attributes nobody minds reading.
    const node = elementWith({ 'data-css-hash': 'jss1234' })

    expect(readFieldValue(node, 'attr', 'data-css-hash')).toBe('jss1234')
  })

  it('is not the image wrapper — it is always a string', () => {
    const node = elementWith({ alt: 'tent' })

    expect(typeof readFieldValue(node, 'attr', 'alt')).toBe('string')
  })
})
