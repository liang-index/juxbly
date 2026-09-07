// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzePage } from '@juxbly/analyzer'
import { SCROLL_PAGE, SHADOW_PAGE, TABLE_PAGE, loadPage } from './fixture-page'

/**
 * `analyzePage` against the three fixture pages — `docs/ARCHITECTURE.md` §5.5
 * (`PageAnalysis`) and the stage 1-2 acceptance criteria.
 *
 * Two of those criteria are worth naming because they are invisible when they pass:
 * hasTable / hasRepeatingList are **not** fields of `PageAnalysis` (§5.5 carries
 * `containers` instead), so "the page has a table" is asserted through a container whose
 * tag path resolves to the row level — the contract wins over the task wording.
 */
describe('analyzePage: custom elements and shadow DOM', () => {
  it('collects every custom element tag name, including ones inside shadow roots', () => {
    const analysis = analyzePage(loadPage(SHADOW_PAGE))

    // Dynamic scan, not a list: M0 returned nothing on YouTube and Reddit because the tag
    // names had moved on and the analyzer was looking for the old ones.
    expect(analysis.customElements).toEqual([
      'my-hidden-panel',
      'my-product-card',
      'my-rating-stars',
    ])
  })

  it('expands open shadow roots and leaves closed ones alone', () => {
    const analysis = analyzePage(loadPage(SHADOW_PAGE))
    const hosts = analysis.shadowHosts.map((host) => host.hostTag)

    expect(hosts).toContain('my-product-card')
    expect(hosts).not.toContain('my-hidden-panel')
    expect(analysis.visibleText).toContain('Wireless keyboard')
    expect(analysis.visibleText).not.toContain('Closed shadow content')
  })

  it('summarises the inside of an open shadow root', () => {
    const analysis = analyzePage(loadPage(SHADOW_PAGE))
    const card = analysis.shadowHosts.find((host) => host.hostTag === 'my-product-card')

    // The summary is what tells the model "there is a card here with a title and a price",
    // which is the signal that makes it pick the right container.
    expect(card?.innerSummary).toContain('span')
    expect(card?.innerSummary).toContain('my-rating-stars')
  })
})

describe('analyzePage: table page', () => {
  it('finds the repeating row container', () => {
    const analysis = analyzePage(loadPage(TABLE_PAGE))
    const rows = analysis.containers.find((container) => container.tagPath.includes('tr'))

    expect(rows?.hitCount).toBe(5)
  })

  it('offers field-level candidates for that container', () => {
    const analysis = analyzePage(loadPage(TABLE_PAGE))
    const rows = analysis.containers.find((container) => container.tagPath.includes('tr'))

    // S1: field selectors were the largest measured failure bucket, so the hint is not
    // optional decoration — it is the highest-value thing in the analysis.
    expect(rows?.fieldHints.length).toBeGreaterThan(0)
    expect(rows?.fieldHints[0]?.selector).toContain('td')
    expect(rows?.fieldHints[0]?.sampleText).toBe('Apple')
  })

  it('keeps script, style and invisible text out of the visible text', () => {
    const analysis = analyzePage(loadPage(TABLE_PAGE))

    expect(analysis.visibleText).toContain('Apple')
    expect(analysis.visibleText).not.toContain('must-not-appear')
    expect(analysis.visibleText).not.toContain('color')
    expect(analysis.visibleText).not.toContain('hidden seo text')
    expect(analysis.visibleText).not.toContain('aria hidden text')
  })

  it('reports the page title', () => {
    expect(analyzePage(loadPage(TABLE_PAGE)).title).toBe('Fruit prices')
  })
})

describe('analyzePage: infinite scroll', () => {
  it('detects the pattern without acting on it', () => {
    const document = loadPage(SCROLL_PAGE)
    const before = document.querySelectorAll('li.post').length

    const analysis = analyzePage(document)

    // A1: detection only. Scrolling is `pre_scroll` in the extract capability (1-5).
    expect(analysis.scrollHint).toBe('infinite')
    expect(document.querySelectorAll('li.post').length).toBe(before)
  })
})

describe('analyzePage: guarantees', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves the page exactly as it found it', () => {
    document.body.innerHTML = '<div><p>hello</p><span>world</span></div>'
    const before = document.body.innerHTML

    analyzePage(document)

    // The analyzer runs inside a page Juxbly does not own: read-only is a boundary.
    expect(document.body.innerHTML).toBe(before)
  })

  it('cuts the text and keeps the structure when the budget runs out', () => {
    const full = analyzePage(loadPage(TABLE_PAGE))
    const truncated = analyzePage(loadPage(TABLE_PAGE), { maxChars: 20 })

    expect(truncated.truncated).toBe(true)
    expect(truncated.visibleText).toHaveLength(20)
    expect(truncated.containers).toEqual(full.containers)
  })

  it('never truncates the custom element list', () => {
    const truncated = analyzePage(loadPage(SHADOW_PAGE), { maxChars: 10 })

    expect(truncated.truncated).toBe(true)
    expect(truncated.customElements).toHaveLength(3)
  })

  it('returns an empty, well-formed analysis for a page with no visible content', () => {
    document.body.innerHTML = '<script>var onlyScriptsHere = 1</script>'
    const analysis = analyzePage(document)

    expect(analysis.visibleText).toBe('')
    expect(analysis.containers).toEqual([])
    expect(analysis.customElements).toEqual([])
    expect(analysis.truncated).toBe(false)
  })

  it('logs nothing at all while analysing', () => {
    const spies = (['info', 'warn', 'error', 'log', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )

    analyzePage(loadPage(TABLE_PAGE))

    // The visible text is page content, and a content script shares its console with the
    // host page. Logging "the length and whether it was truncated" is allowed; logging
    // nothing is the only way to be sure the text itself never gets there.
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('takes its timestamp from the caller when one is given', () => {
    const analysis = analyzePage(loadPage(TABLE_PAGE), { now: () => '2026-09-06T00:00:00.000Z' })

    expect(analysis.analyzedAt).toBe('2026-09-06T00:00:00.000Z')
  })
})
