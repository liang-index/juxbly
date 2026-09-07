// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { collectNodes, collectVisibleText, isInvisible } from '@juxbly/analyzer'

/**
 * Visible-text simplification — the largest, cheapest part of what the model sees.
 *
 * Everything the model never gets is deliberate: script and style content is noise,
 * hidden text is a trap (hidden SEO copy is on real pages), and the markers that survive
 * are there because they are what lets a model propose a container.
 */
function textOf(html: string, maxChars?: number): string {
  document.body.innerHTML = html
  const walk = collectNodes(document.body, { skip: isInvisible })
  return collectVisibleText(walk.nodes, maxChars).text
}

describe('collectVisibleText', () => {
  it('drops script and style content', () => {
    const text = textOf('<p>Real copy</p><script>var leaked = 1</script><style>.a{color:red}</style>')

    expect(text).toContain('Real copy')
    expect(text).not.toContain('leaked')
    expect(text).not.toContain('color')
  })

  it('drops every kind of invisible subtree', () => {
    const text = textOf(
      '<p>Visible</p>' +
        '<div style="display:none">inline hidden</div>' +
        '<div hidden>hidden attribute</div>' +
        '<div aria-hidden="true">aria hidden</div>',
    )

    expect(text).toBe('Visible')
  })

  it('keeps the hierarchy markers that make a container guessable', () => {
    const text = textOf('<h2>Heading</h2><ul><li>First</li><li>Second</li></ul>')

    expect(text).toContain('## Heading')
    expect(text).toContain('- First')
    expect(text).toContain('- Second')
  })

  it('separates table cells so a row still reads as a row', () => {
    const text = textOf('<table><tr><td>Apple</td><td>1.20</td></tr></table>')

    expect(text).toContain('Apple | 1.20')
  })

  it('collapses whitespace and drops zero-width characters', () => {
    const zeroWidth = String.fromCharCode(0x200b)
    const text = textOf(`<p>too     much    space and${zeroWidth} marks</p>`)

    expect(text).toBe('too much space and marks')
  })

  it('truncates at the budget and says so', () => {
    document.body.innerHTML = `<p>${'x'.repeat(500)}</p>`
    const walk = collectNodes(document.body, { skip: isInvisible })

    const short = collectVisibleText(walk.nodes, 20)
    const long = collectVisibleText(walk.nodes)

    expect(short.text).toHaveLength(20)
    expect(short.truncated).toBe(true)
    expect(long.truncated).toBe(false)
  })
})
