/**
 * What stands in for the live page when the benchmark runs: a corpus snapshot parsed
 * into a document, plus the `DomPort` (§6.1) the runtime reads it through.
 *
 * The port is backed by `queryAll` from `@juxbly/capabilities` — the same reference
 * implementation `tests/fixtures/page-host.ts` uses. The benchmark therefore measures
 * the product's own traversal, not a second one written for the occasion.
 */
import { JSDOM } from 'jsdom'
import { queryAll } from '@juxbly/capabilities'
import type { DomPort } from '@juxbly/core'

/**
 * A shadow root nested inside another is declared in the outer `<template>`, which the
 * parser keeps in a fragment — one pass cannot see it. The cap mirrors the query's own
 * nesting limit, and mounting is idempotent because a mounted template is removed.
 */
const MAX_MOUNT_PASSES = 6

export interface SnapshotHost {
  readonly document: Document
  readonly dom: DomPort
}

/**
 * Parses a snapshot into a stand-alone document and hands back the port for it.
 *
 * The URL is part of the fixture, not decoration: the analyser reports it and the model
 * sees it, so a snapshot parsed without one would be a different page to the model.
 *
 * `scrollToBottom` always reports "nothing more": the corpus captured the grown page,
 * so the interaction a bucket-`D` task depends on already happened at capture time
 * (the measurement is in the snapshot's `bucketEvidence`). A port that pretended to
 * load more would be inventing content the benchmark never measured.
 */
/**
 * The globals a mounted view needs, taken from the snapshot's own realm.
 *
 * `render` is a real step and `mountView` is React DOM (`createRoot` + `flushSync`), so
 * a host that cannot host a view turns every tool that ends in `render` into
 * `CAPABILITY_FAILED` — and since Build Success Rate demands a clean run, the headline
 * number collapses to 0% for reasons that have nothing to do with the product.
 *
 * They must come from *this* document's jsdom realm: React checks nodes with
 * `instanceof Element`, and a second realm's `Element` would reject the very nodes the
 * port hands out.
 */
const VIEW_HOST_GLOBALS = [
  'window',
  'document',
  'navigator',
  'Document',
  'DocumentFragment',
  'Element',
  'HTMLElement',
  'HTMLTemplateElement',
  'Node',
  'NodeFilter',
  'ShadowRoot',
  'DOMParser',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'CSSStyleDeclaration',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]

function installViewHost(window: Window & typeof globalThis): void {
  const globals = globalThis as unknown as Record<string, unknown>
  const source = window as unknown as Record<string, unknown>
  for (const name of VIEW_HOST_GLOBALS) {
    if (source[name] === undefined) continue
    // `navigator` and friends are getter-only on the Node global object (Node 21+), so a
    // plain assignment throws; redefining the property is the only way to replace them.
    Object.defineProperty(globals, name, {
      value: source[name],
      writable: true,
      configurable: true,
      enumerable: true,
    })
  }
}

export function createSnapshotHost(html: string, url: string): SnapshotHost {
  const { window } = new JSDOM(html, { url })
  const document = window.document
  installViewHost(window)
  mountDeclarativeShadowRoots(document)

  const dom: DomPort = {
    query: (selector, scope) => queryAll(scope ?? document, selector),
    mountPoint: () => document.createElement('div'),
    scrollToBottom: async () => false,
  }

  return { document, dom }
}

/**
 * Declarative shadow DOM: `<template shadowrootmode="open">` is how capture serialised
 * a shadow root. A parser that does not honour it turns every bucket-`C` snapshot into
 * a bucket-`A` page and the benchmark quietly measures the wrong thing — the same
 * degradation 2-1 already had to hunt down once.
 */
export function mountDeclarativeShadowRoots(document: Document): void {
  for (let pass = 0; pass < MAX_MOUNT_PASSES; pass += 1) {
    const templates = queryAll(document, 'template[shadowrootmode]').filter(isTemplate)
    if (templates.length === 0) return

    for (const template of templates) {
      const host = template.parentElement
      if (host !== null) {
        const mode = template.getAttribute('shadowrootmode') === 'closed' ? 'closed' : 'open'
        host.attachShadow({ mode }).append(template.content)
      }
      // Removed either way: an unmounted template would be found again next pass.
      template.remove()
    }
  }
}

/** `queryAll` returns `Element`; it is the template's `content` a host mounts. */
function isTemplate(element: Element): element is HTMLTemplateElement {
  return element instanceof HTMLTemplateElement
}
