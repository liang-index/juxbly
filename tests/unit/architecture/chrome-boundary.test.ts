import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Regression guard for `docs/ARCHITECTURE.md` §6.4 and §6.4.1.
 *
 * `packages/browser` is the only place that wraps platform APIs. The single exception is
 * the entrypoint assembly layer, which MV3 calls directly and which therefore cannot be
 * handed an injected adapter.
 *
 * That exception is granted by **file plus API path**, never by directory:
 *
 *   1. Outside the two sanctioned locations, no source file may reference `chrome.*` or
 *      the `browser.*` platform namespace.
 *   2. Inside `entrypoints/background.ts`, every platform API that appears has to be one
 *      of the registration calls listed in §6.4.1.
 *   3. Inside `apps/playground/**`, every platform API has to be `storage.*` — the one
 *      namespace the lifecycle harness needs (see `PLAYGROUND_ALLOWED_NAMESPACE`).
 *
 * Assertions 2 and 3 are what stop the exceptions from growing: a fifth call fails here
 * instead of riding along on an exception written for four. It is deliberately a *scan*
 * rather than a type check, so it keeps working as packages grow.
 *
 * ESLint enforces the same boundary at lint time (`eslint.config.js`); this test keeps
 * enforcing it when lint is skipped.
 */

// tests/unit/architecture/ → up three levels to the repository root
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

const SCAN_ROOTS = ['packages', 'apps']
const PLATFORM_PACKAGE = join('packages', 'browser')
const ASSEMBLY_FILE = join('apps', 'extension', 'entrypoints', 'background.ts')
const PLAYGROUND_DIR = join('apps', 'playground')

/**
 * §6.4 exception, test side (stage 1-14).
 *
 * `apps/playground` is a development carrier that never ships: it serves the fixture
 * pages, replays a recorded model, and drives the real extension through its UI. The
 * lifecycle harness reads what the UI wrote by evaluating *inside the extension's own
 * service worker*, because the alternative — asking the panel under test to report on
 * itself — would be no evidence at all. `chrome.storage.local` is therefore unavoidable,
 * and ESLint already lifts `no-restricted-globals` for the directory for the same reason.
 *
 * What it does *not* get is a free pass: this is a namespace allowlist, so a harness that
 * one day reaches for `tabs.*` or `downloads.*` fails here instead of quietly widening
 * the boundary.
 */
const PLAYGROUND_ALLOWED_NAMESPACE = 'storage'

/** The table in `docs/ARCHITECTURE.md` §6.4.1. Adding one means changing that table first. */
const ALLOWED_ASSEMBLY_APIS = [
  'commands.onCommand',
  'runtime.getURL',
  'runtime.onInstalled',
  'runtime.onMessage',
  'tabs.query',
  'tabs.sendMessage',
  // Stage 1-13: the toolbar overview's click — focus the tab already on this tool's page
  // or open one when there is none (UI_SPEC §7.2). Same shape as the two above: a
  // platform action with no business rule attached, and no `tabs` permission requested.
  'tabs.create',
  'tabs.update',
]

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.output', '.wxt', 'coverage'])

/**
 * Matches `chrome.foo` and `browser.foo` — the two namespaces the platform is reachable
 * through — but not `chrome-extension://` or a bare `browser` identifier.
 *
 * Comments are scanned too: stripping them reliably needs a parser, and a false positive
 * costs one rewording while a false negative costs the invariant. Avoid writing
 * `chrome.something` in a comment outside the sanctioned locations.
 *
 * The lookbehind keeps a **module path** from reading as a platform namespace: `./browser.mjs`
 * is an import, not `browser.*`. Without it every file importing the harness's own
 * `browser.mjs` is reported as an offender.
 */
const PLATFORM_REFERENCE = /(?<![\w/])(?:chrome|browser)\s*\.\s*([A-Za-z][\w.]*)/g

function collectSourceFiles(relativeDir: string): string[] {
  const entries = readdirSync(join(REPO_ROOT, relativeDir), { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(relativeDir, entry.name)

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      files.push(...collectSourceFiles(entryPath))
      continue
    }

    if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(entryPath)
    }
  }

  return files
}

/** `runtime.onMessage.addListener` → `runtime.onMessage`, the granularity §6.4.1 lists. */
function apiPath(raw: string): string {
  return raw
    .split('.')
    .filter(Boolean)
    .slice(0, 2)
    .join('.')
}

function platformApisIn(source: string): string[] {
  return [...source.matchAll(PLATFORM_REFERENCE)].map((match) => apiPath(match[1] ?? ''))
}

describe('architecture: platform API boundary', () => {
  it('packages/browser exists as the sanctioned boundary', () => {
    // Guards against the scan below passing vacuously if the package is ever renamed.
    expect(statSync(join(REPO_ROOT, PLATFORM_PACKAGE)).isDirectory()).toBe(true)
  })

  // Same reason as key-leak's widened scan: the walk is O(source tree), and the tree
  // outgrew the default 5 s timeout. A size-flaky guard is an ignored guard.
  it('no source file outside the sanctioned locations references platform APIs', { timeout: 30_000 }, () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const file of collectSourceFiles(root)) {
        if (file === ASSEMBLY_FILE) continue
        if (file.startsWith(PLATFORM_PACKAGE)) continue

        const source = readFileSync(join(REPO_ROOT, file), 'utf8')

        if (file.startsWith(PLAYGROUND_DIR)) {
          const outside = platformApisIn(source).filter(
            (api) => api.split('.')[0] !== PLAYGROUND_ALLOWED_NAMESPACE,
          )
          if (outside.length > 0) offenders.push(`${file} → ${outside.join(', ')}`)
          continue
        }

        if (platformApisIn(source).length > 0) {
          offenders.push(file)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('the assembly layer stays inside the API list of ARCHITECTURE §6.4.1', () => {
    const source = readFileSync(join(REPO_ROOT, ASSEMBLY_FILE), 'utf8')
    const used = [...new Set(platformApisIn(source))]
    const unexpected = used.filter((api) => !ALLOWED_ASSEMBLY_APIS.includes(api))

    expect(unexpected).toEqual([])
  })
})
