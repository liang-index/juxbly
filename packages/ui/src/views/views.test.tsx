// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardView, TableView, TextView, renderView } from './index'

/**
 * Result views — `docs/UI_SPEC.md` §7 / §11 / §12.
 *
 * Rendered through `renderToStaticMarkup` so the assertions see exactly what the panel
 * will show, with no mounting machinery in between: structure, the empty/error split, and
 * the two security rules that the result area lives or dies by.
 */
const ITEMS = [
  { title: 'Wireless keyboard', price: 49, url: 'https://example.com/keyboard' },
  { title: 'Wireless mouse', price: 29, url: 'https://example.com/mouse' },
]

const markupOf = (
  view: 'table' | 'card' | 'text',
  items: readonly Record<string, unknown>[] = ITEMS,
): string => renderToStaticMarkup(renderView(view, { items }))

describe('TableView', () => {
  it('renders columns as the union of the record keys', () => {
    const markup = markupOf('table')

    expect(markup).toContain('title')
    expect(markup).toContain('price')
    expect(markup).toContain('Wireless keyboard')
  })

  it('matches its snapshot', () => {
    expect(renderToStaticMarkup(<TableView items={ITEMS} />)).toMatchSnapshot()
  })
})

describe('CardView', () => {
  it('shows one card per record with the field name above the value', () => {
    const markup = markupOf('card')

    expect(markup).toContain('jx-card')
    expect(markup).toContain('jx-card-key')
    expect(markup).toContain('Wireless mouse')
  })

  it('matches its snapshot', () => {
    expect(renderToStaticMarkup(<CardView items={ITEMS} />)).toMatchSnapshot()
  })
})

describe('TextView', () => {
  it('renders one line per record, fields joined', () => {
    const markup = markupOf('text')

    expect(markup).toContain('title: Wireless keyboard')
    expect(markup).toContain('price: 29')
  })

  it('matches its snapshot', () => {
    expect(renderToStaticMarkup(<TextView items={ITEMS} />)).toMatchSnapshot()
  })
})

describe('links (UI_SPEC §12: page content is untrusted)', () => {
  it('renders an http(s) value as a link', () => {
    const markup = markupOf('table')

    expect(markup).toContain('href="https://example.com/keyboard"')
  })

  it('renders a javascript: value as plain text, never as a link', () => {
    const hostile = [{ title: 'free prize', url: 'javascript:alert(1)' }]
    const markup = markupOf('table', hostile)

    // The text is allowed to show; the executable href is not.
    expect(markup).not.toContain('href="javascript:')
    expect(markup).toContain('javascript:alert(1)')
  })

  it('never uses innerHTML or dangerouslySetInnerHTML', () => {
    const markup = markupOf('table')

    expect(markup).not.toMatch(/<script/i)
    expect(markup).not.toContain('dangerously')
  })
})

describe('states (UI_SPEC §7: 0 rows is an answer, not an error)', () => {
  it('shows guidance copy for an empty result, with no error styling', () => {
    const markup = renderToStaticMarkup(<TableView items={[]} status="empty" />)

    expect(markup).toContain('No rows yet')
    expect(markup).not.toContain('jx-view-note--error')
  })

  it('shows an error only for a real failure', () => {
    const markup = renderToStaticMarkup(<TextView items={[]} status="error" error="boom" />)

    expect(markup).toContain('boom')
    expect(markup).toContain('jx-view-note--error')
  })

  it('shows a loading note while data is on its way', () => {
    expect(renderToStaticMarkup(<CardView items={[]} status="loading" />)).toContain('Loading')
  })
})

describe('value handling', () => {
  it('trims long values instead of pushing the panel open', () => {
    const long = 'x'.repeat(300)
    const markup = markupOf('text', [{ title: long }])

    expect(markup).not.toContain(long)
    expect(markup).toContain('...')
  })

  it('caps the number of rows and says so', () => {
    const many = Array.from({ length: 501 }, (_, index) => ({ title: `row ${String(index)}` }))
    const markup = renderToStaticMarkup(<TableView items={many} />)

    expect(markup).toContain('Some rows are hidden')
  })
})

describe('tokens (UI_SPEC §12: components carry no colour literals)', () => {
  it('renders no inline styles and no raw colour values', () => {
    for (const view of ['table', 'card', 'text'] as const) {
      const markup = markupOf(view)

      // All colour and motion live in tokens.css; a value in a component defeats the point.
      expect(markup).not.toContain('style="')
      expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    }
  })
})
