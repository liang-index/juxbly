// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { collectCustomElements, collectNodes, isInvisible } from '@juxbly/analyzer'

/**
 * Dynamic custom-element scan.
 *
 * There is no list to maintain: a hyphen in the tag name *is* the definition of a custom
 * element, so a site that ships a new component is picked up the day it ships it. That is
 * the entire fix for the M0 failure where YouTube and Reddit returned nothing.
 */
function elementsOf(html: string): Element[] {
  document.body.innerHTML = html
  const walk = collectNodes(document.body, { skip: isInvisible })
  return walk.nodes.filter((node): node is Element => node.nodeType === 1)
}

describe('collectCustomElements', () => {
  it('collects every custom tag name', () => {
    expect(collectCustomElements(elementsOf('<my-card></my-card><my-badge></my-badge>'))).toEqual([
      'my-badge',
      'my-card',
    ])
  })

  it('records a tag once however often it appears', () => {
    const tags = collectCustomElements(
      elementsOf('<my-card></my-card><my-card></my-card><my-card></my-card>'),
    )

    expect(tags).toEqual(['my-card'])
  })

  it('collects tags inside an open shadow root', () => {
    document.body.innerHTML = '<my-card></my-card>'
    const host = document.querySelector('my-card')
    host?.attachShadow({ mode: 'open' }).append(document.createElement('my-rating'))

    const walk = collectNodes(document.body, { skip: isInvisible })
    const elements = walk.nodes.filter((node): node is Element => node.nodeType === 1)

    expect(collectCustomElements(elements)).toEqual(['my-card', 'my-rating'])
  })

  it('ignores standard tags', () => {
    expect(collectCustomElements(elementsOf('<div><span>x</span></div>'))).toEqual([])
  })
})
