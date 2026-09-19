/**
 * The playground's HTTP side — `task/stage-1-14.md` Scope 1, Files.
 *
 * Three things are served from one origin, because the extension has to see all three as
 * normal browsing:
 *
 * - **the fixture pages** (`tests/fixtures/pages/`) and the lifecycle page — the pages a
 *   tool is built and broken against, and the seed corpus Phase 2 grows from;
 * - **the Web Corpus** (`tests/benchmark/corpus/`) — the snapshotted pages Phase 2 measures
 *   against. Served from here so "the snapshot loads offline" can be asserted over HTTP
 *   rather than trusted;
 * - **a recorded model** at `/v1/chat/completions`, OpenAI-compatible, so the extension's
 *   own BYOK client talks to it unmodified. Nothing about the product knows this endpoint
 *   is a recording: it is set as `api_base_url`, exactly like a provider would be;
 * - **the harness API** under `/__harness/` — how the script switches the page to its
 *   redesigned shape, picks a scenario, and reads the model's authoritative call counts.
 *
 * The harness exists *outside* the extension deliberately. Nothing here reaches into
 * `chrome.storage`, shadows storage writes, or calls internal messages: every step the
 * script asserts about must have happened because the extension did it.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModelMock } from './lib/model-mock.mjs'
import { LIFECYCLE_PATH, PAGE_VARIANTS, lifecyclePage } from './lib/pages.mjs'
import { CORPUS_ROOT } from './lib/corpus.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
}

export function createPlaygroundServer(options = {}) {
  const fixturesDir = options.fixturesDir ?? join(REPO_ROOT, 'tests/fixtures/pages')
  const model = createModelMock({ pattern: options.urlPattern ?? '127.0.0.1/*' })

  const server = createServer((req, res) => {
    void route(req, res).catch((error) => {
      send(res, 500, { error: String(error) })
    })
  })

  async function route(req, res) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    corsHeaders(req, res)

    if (req.method === 'OPTIONS') return empty(res, 204)

    if (url.pathname === '/v1/chat/completions') return handleCompletion(req, res)
    if (url.pathname.startsWith('/__harness/')) return await handleHarness(req, res, url)
    if (url.pathname === LIFECYCLE_PATH) return html(res, lifecyclePage(model.state().variant))
    if (url.pathname.startsWith('/pages/')) return await serveFixture(res, url, fixturesDir)
    if (url.pathname.startsWith('/corpus/')) return await serveCorpus(res, url)
    if (url.pathname === '/corpus-index') return await sendFile(res, join(CORPUS_ROOT, 'index.json'))
    if (url.pathname === '/') return await sendFile(res, join(HERE, 'index.html'))
    if (url.pathname === '/model-state') return send(res, 200, model.state())
    return send(res, 404, { error: 'not found' })
  }

  async function handleCompletion(req, res) {
    const body = await readJson(req)
    if (body === null) return send(res, 400, { error: 'invalid json body' })
    send(res, 200, model.completion(body))
  }

  async function handleHarness(req, res, url) {
    if (url.pathname === '/__harness/state') return send(res, 200, model.state())

    if (url.pathname === '/__harness/reset') return send(res, 200, model.reset())

    if (url.pathname === '/__harness/page') {
      const body = await readJson(req)
      const variant = String(body?.variant ?? '')
      if (!PAGE_VARIANTS.includes(variant)) {
        return send(res, 400, { error: `variant must be one of ${PAGE_VARIANTS.join(' | ')}` })
      }
      return send(res, 200, model.setVariant(variant))
    }

    if (url.pathname === '/__harness/scenario') {
      const body = await readJson(req)
      return send(res, 200, model.setScenario(body ?? {}))
    }

    return send(res, 404, { error: 'unknown harness endpoint' })
  }

  /**
   * The Web Corpus (stage 2-1). Serving it is what makes "offline-loadable" a testable
   * claim: a snapshot only counts once the playground can hand it back over HTTP with no
   * network behind it.
   */
  async function serveCorpus(res, url) {
    const name = normalize(url.pathname.slice('/corpus/'.length)).replace(/^(\.\.[/\\])+/, '')
    await sendFile(res, join(CORPUS_ROOT, name))
  }

  async function serveFixture(res, url, dir) {
    const name = normalize(url.pathname.slice('/pages/'.length)).replace(/^(\.\.[/\\])+/, '')
    await sendFile(res, join(dir, name))
  }

  return server
}

/** Starts the server and resolves once it is listening, with the resolved origin. */
export function startPlaygroundServer(options = {}) {
  const server = createPlaygroundServer(options)
  return new Promise((done, fail) => {
    server.on('error', fail)
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      done({
        port,
        origin: `http://127.0.0.1:${String(port)}`,
        close: () => new Promise((ok) => server.close(ok)),
      })
    })
  })
}

async function sendFile(res, path) {
  try {
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'text/plain; charset=utf-8' })
    res.end(body)
  } catch {
    send(res, 404, { error: 'not found' })
  }
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

function corsHeaders(req, res) {
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*')
  res.setHeader('access-control-allow-headers', 'authorization, content-type')
  res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS')
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': MIME['.json'] })
  res.end(JSON.stringify(payload))
}

function html(res, body) {
  res.writeHead(200, { 'content-type': MIME['.html'] })
  res.end(body)
}

function empty(res, status) {
  res.writeHead(status)
  res.end()
}
