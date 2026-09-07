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
