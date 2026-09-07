import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Fixture loader for the analyzer tests.
 *
 * These fixtures are the seed of the Phase 2 Web Corpus, so they are whole documents
 * rather than fragments: what the analyzer sees is described in one file, and the same
 * file can be served by the corpus runner later.
 *
 * Resolved from the working directory, not from `import.meta.url`: under the jsdom
 * environment the module URL is not a `file:` URL, and `fileURLToPath` refuses it. Every
 * runner entry point in this repository starts at the repository root.
 */
const PAGES_DIR = resolve(process.cwd(), 'tests', 'fixtures', 'pages')

export const SHADOW_PAGE = 'shadow-custom-elements.html'
export const TABLE_PAGE = 'table-page.html'
export const SCROLL_PAGE = 'infinite-scroll.html'

export function loadPage(name: string): Document {
  const html = readFileSync(join(PAGES_DIR, name), 'utf8')
  const document = new DOMParser().parseFromString(html, 'text/html')
  mountShadowTemplates(document)
  return document
}

/**
 * HTML cannot declare a shadow root, so the fixtures declare one with
 * `<template data-shadow-mode>` and this moves the content into the host.
 *
 * `template` is one of the tags the analyzer never reads (its content lives in a separate
 * fragment), so a fixture that fails to mount shows up as missing content rather than as
 * duplicated content — the failure is loud, which is the point.
 */
function mountShadowTemplates(document: Document): void {
  const templates = document.querySelectorAll<HTMLTemplateElement>('template[data-shadow-mode]')
  for (const template of Array.from(templates)) {
    const host = template.parentElement
    if (host === null) continue

    const mode = template.getAttribute('data-shadow-mode') === 'closed' ? 'closed' : 'open'
    host.attachShadow({ mode }).append(template.content)
  }
}
