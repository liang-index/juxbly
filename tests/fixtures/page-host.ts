/**
 * The stand-in host for a fixture page: what the content script would supply in
 * production.
 *
 * `extract` only ever talks to a `DomPort` (§6.1), so a fixture is not "some HTML in a
 * test" — it is a document plus a port that answers `query` and `scrollToBottom` the way
 * a real page would. Building it once here keeps the unit tests and the integration test
 * honest: they exercise the same port shape the content script will implement.
 *
 * `query` is backed by `queryAll` from `@juxbly/capabilities`, which is the reference
 * implementation a host uses — the tests therefore read the DOM through production code,
 * not through a second, subtly different traversal.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { queryAll } from '@juxbly/capabilities'
import type { DomPort } from '@juxbly/core'

/**
 * Resolved from the working directory, not from `import.meta.url`: under the jsdom
 * environment the module URL is not a `file:` URL and `fileURLToPath` refuses it. Every
 * runner entry point in this repository starts at the repository root.
 */
const PAGES_DIR = resolve(process.cwd(), 'tests', 'fixtures', 'pages')

/**
 * A shadow root nested inside another shadow root is declared in the content of the outer
 * `<template>`, which the parser keeps in a fragment — so one pass cannot see it. The
 * cap is the same nesting limit the query itself uses, and mounting is idempotent
 * because a mounted template is removed.
 */
const MAX_MOUNT_PASSES = 6

export interface FixtureHost {
  document: Document
  dom: DomPort
  /** How many times `scrollToBottom` has been called — the assertion for `pre_scroll.max`. */
  readonly scrolls: number
}

export interface FixtureHostOptions {
  /** Replaces the default lazy-page growth, for tests that need a page that never stops. */
  scroll?: () => boolean
}

export function createFixtureHost(name: string, options: FixtureHostOptions = {}): FixtureHost {
  const document = loadFixturePage(name)
  let scrolls = 0

  const dom: DomPort = {
    query: (selector, scope) => queryAll(scope ?? document, selector),
    mountPoint: () => {
      throw new Error('fixture host: extract must not mount anything')
    },
    scrollToBottom: async () => {
      scrolls += 1
      return options.scroll === undefined ? growLazyPage(document) : options.scroll()
    },
  }

  return {
    document,
    dom,
    get scrolls(): number {
      return scrolls
    },
  }
}

/**
 * Parses a fixture into a stand-alone document.
 *
 * Fixtures are whole documents rather than fragments: what the extractor sees is
 * described in one file, and the same file can be served by the Phase 2 corpus runner.
 */
export function loadFixturePage(name: string): Document {
  const html = readFileSync(join(PAGES_DIR, name), 'utf8')
  const document = new DOMParser().parseFromString(html, 'text/html')
  mountShadowTemplates(document)
  return document
}

/**
 * What a real page does when it is scrolled to the bottom: append the next deferred page.
 * Returns false once there is nothing left, which is how `pre_scroll` knows to stop.
 */
export function growLazyPage(document: Document): boolean {
  const list = document.querySelector('[data-lazy-list]')
  const next = document.querySelector<HTMLTemplateElement>('template[data-lazy-page]')
  if (list === null || next === null) return false

  list.append(next.content)
  next.remove()
  return true
}

/**
 * HTML cannot declare a shadow root, so the fixtures declare one with
 * `<template data-shadow-mode>` and this moves the content into the host. A fixture that
 * fails to mount shows up as missing content rather than duplicated content — the failure
 * is loud, which is the point.
 */
function mountShadowTemplates(document: Document): void {
  for (let pass = 0; pass < MAX_MOUNT_PASSES; pass += 1) {
    const templates = queryAll(document, 'template[data-shadow-mode]').filter(isTemplate)
    if (templates.length === 0) return

    for (const template of templates) {
      const host = template.parentElement
      if (host !== null) {
        const mode = template.getAttribute('data-shadow-mode') === 'closed' ? 'closed' : 'open'
        host.attachShadow({ mode }).append(template.content)
      }
      // Removed either way: an unmounted template would be found again next pass.
      template.remove()
    }
  }
}

/** `queryAll` returns `Element`; the template's `content` is what the loader needs. */
function isTemplate(element: Element): element is HTMLTemplateElement {
  return element instanceof HTMLTemplateElement
}
