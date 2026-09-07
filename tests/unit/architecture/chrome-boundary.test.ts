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
 *
 * Assertion 2 is what stops the exception from growing: a fifth call fails here instead
 * of riding along on an exception written for four. It is deliberately a *scan* rather
 * than a type check, so it keeps working as packages grow.
 *
 * ESLint enforces the same boundary at lint time (`eslint.config.js`); this test keeps
 * enforcing it when lint is skipped.
 */

// tests/unit/architecture/ → up three levels to the repository root
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

const SCAN_ROOTS = ['packages', 'apps']
const PLATFORM_PACKAGE = join('packages', 'browser')
const ASSEMBLY_FILE = join('apps', 'extension', 'entrypoints', 'background.ts')

/** The table in `docs/ARCHITECTURE.md` §6.4.1. Adding one means changing that table first. */
const ALLOWED_ASSEMBLY_APIS = [
  'commands.onCommand',
  'runtime.getURL',
  'runtime.onInstalled',
  'runtime.onMessage',
  'tabs.query',
  'tabs.sendMessage',
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
 */
const PLATFORM_REFERENCE = /\b(?:chrome|browser)\s*\.\s*([A-Za-z][\w.]*)/g

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

  it('no source file outside the sanctioned locations references platform APIs', () => {
    const offenders: string[] = []

    for (const root of SCAN_ROOTS) {
      for (const file of collectSourceFiles(root)) {
        if (file === ASSEMBLY_FILE) continue
        if (file.startsWith(PLATFORM_PACKAGE)) continue

        if (platformApisIn(readFileSync(join(REPO_ROOT, file), 'utf8')).length > 0) {
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
