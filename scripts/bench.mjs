#!/usr/bin/env node
/**
 * `pnpm test:bench` — runs the stage 2-3 benchmark outside a browser.
 *
 * The runner is TypeScript inside `apps/playground/src/bench/`, and this file is the
 * bridge: it loads that module through Vite's SSR pipeline so the benchmark imports
 * `@juxbly/*` exactly the way the tests and the extension do. No build step, no second
 * resolution strategy, nothing to keep in sync.
 *
 * The DOM globals come from jsdom before the module is loaded: the runner parses corpus
 * snapshots, and `DOMParser` has to exist at parse time, not at call time.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createViteServer } from 'vitest/node'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = '/apps/playground/src/bench/cli.ts'

const DOM_GLOBALS = [
  'DOMParser',
  'Element',
  'HTMLElement',
  'HTMLTemplateElement',
  'DocumentFragment',
  'ShadowRoot',
  'Node',
  'NodeFilter',
]

function installDom() {
  const { window } = new JSDOM('<!doctype html><html><body></body></html>')
  for (const name of DOM_GLOBALS) {
    globalThis[name] = window[name]
  }
}

async function run() {
  installDom()

  // `configFile` is the repository's own Vite config: the `@juxbly/*` aliases live there,
  // so the benchmark resolves packages through the one place that defines them.
  const server = await createViteServer({
    root: ROOT,
    configFile: resolve(ROOT, 'vitest.config.ts'),
    logLevel: 'error',
    // No HMR: this server exists to transform modules, and its dev-server socket would
    // otherwise claim a port and complain when something else already holds it.
    server: { middlewareMode: true, hmr: false },
  })

  try {
    const module = await server.ssrLoadModule(ENTRY)
    const code = await module.main(process.argv.slice(2))
    process.exitCode = code ?? 0
  } finally {
    await server.close()
  }
}

await run()
