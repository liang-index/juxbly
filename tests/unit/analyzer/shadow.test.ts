// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { collectNodes } from '@juxbly/analyzer'

/**
 * Shadow traversal: open roots are expanded, closed roots are skipped, and both caps stop
 * a pathological page from taking the host page down with it.
 */
function build(levels: number): void {
  document.body.innerHTML = ''
  let host = document.createElement('div')
  document.body.append(host)

  for (let level = 0; level < levels; level += 1) {
    const child = document.createElement('div')
    host.attachShadow({ mode: 'open' }).append(child)
    host = child
  }
}

describe('collectNodes', () => {
  it('walks into an open shadow root and records its host', () => {
    document.body.innerHTML = '<my-card></my-card>'
    const host = document.querySelector('my-card')
    const root = host?.attachShadow({ mode: 'open' })
    if (root === null || root === undefined) throw new Error('fixture: no shadow root')
    root.append(Object.assign(document.createElement('span'), { textContent: 'inside' }))

    const walk = collectNodes(document.body)

    expect(walk.shadowHosts.map((entry) => entry.hostTag)).toEqual(['my-card'])
    const text = walk.nodes
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent)
      .join('')
    expect(text).toContain('inside')
  })

  it('skips a closed shadow root without failing', () => {
    document.body.innerHTML = '<my-card></my-card>'
    const host = document.querySelector('my-card')
    const root = host?.attachShadow({ mode: 'closed' })
    if (root === null || root === undefined) throw new Error('fixture: no shadow root')
    root.append(Object.assign(document.createElement('span'), { textContent: 'private' }))

    const walk = collectNodes(document.body)

    // Closed roots are unreadable by platform design; probing them is not an option, and
    // throwing here would break every page that uses one.
    expect(walk.shadowHosts).toEqual([])
    expect(walk.truncated).toBe(false)
  })

  it('stops at the shadow depth cap instead of walking forever', () => {
    build(3)

    const capped = collectNodes(document.body, { maxShadowDepth: 2 })
    const deep = collectNodes(document.body, { maxShadowDepth: 6 })

    expect(capped.truncated).toBe(true)
    expect(deep.truncated).toBe(false)
    expect(deep.shadowHosts).toHaveLength(3)
  })

  it('stops at the node budget and reports it', () => {
    document.body.innerHTML = '<ul><li>a</li><li>b</li><li>c</li><li>d</li><li>e</li></ul>'

    const walk = collectNodes(document.body, { maxNodes: 3 })

    expect(walk.truncated).toBe(true)
    expect(walk.nodes.length).toBeLessThanOrEqual(3)
  })
})
