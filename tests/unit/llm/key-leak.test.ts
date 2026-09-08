import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMockAdapter } from '@juxbly/browser'
import type { Settings } from '@juxbly/core'
import { handleRunLlm } from '@juxbly/llm'
import type { LlmFetch } from '@juxbly/llm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `docs/ARCHITECTURE.md` §12.2 — the BYOK key never enters the content script, the page
 * context or a log. Three assertions, because the three leak paths are unrelated and a
 * guard for one says nothing about the others:
 *
 *   1. source: only the background-side llm package may touch `Settings.api_key`;
 *   2. logs: a real call with a real-shaped key leaves no trace of it;
 *   3. messages: the reply heading back to a content script carries no key.
 */

const FAKE_KEY = 'sk-juxbly-test-0000000000'

const SETTINGS: Settings = {
  api_key: FAKE_KEY,
  api_base_url: 'https://example.test/v1',
  model: 'gpt-4o-mini',
  floating_ball_enabled: true,
}

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const SCAN_ROOTS = ['packages', 'apps/extension']
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.output', '.wxt', 'coverage'])

/**
 * Files allowed to *mention* the key at all: the type that declares it, and the two
 * storage modules whose comments state its lifetime. None of them reads the field —
 * `packages/storage/src/onboarding.ts` is here for `OnboardingFlags.api_key_requested`,
 * the one-shot "was the user ever asked for a key" milestone. It is a flag name, not the
 * key, and it lives next to the settings module for the same reason: both are the
 * storage-layer description of the key's journey through the product.
 */
const MENTION_WHITELIST = new Set([
  'packages/core/src/tool-record.ts',
  'packages/storage/src/settings.ts',
  'packages/storage/src/onboarding.ts',
])

/** The only package allowed to read the field (`packages/llm`, background context). */
const READ_WHITELIST_PREFIX = 'packages/llm/'

const KEY_MENTION = /api_key/
const KEY_FIELD_READ = /\.api_key\b/

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

const SOURCE_FILES = SCAN_ROOTS.flatMap(collectSourceFiles)

let logged: string[] = []
const consoleMethods = ['info', 'warn', 'error', 'log', 'debug'] as const

beforeEach(() => {
  logged = []
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((arg) => String(arg)).join(' '))
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const okFetch: LlmFetch = async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ choices: [{ message: { content: 'a summary' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
})

const authFailedFetch: LlmFetch = async () => ({ ok: false, status: 401, text: async () => 'no' })

const STEP = { type: 'llm', task: 'summarize', input_from: 'raw_items', output_to: 'summary' } as const

describe('api key — source scan', () => {
  it('finds the source tree (the scan below must not pass vacuously)', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(10)
  })

  // The scan walks every source file on disk; the repo outgrew the default 5 s
  // test timeout, and a guard that fails on repo size is a guard that gets ignored.
  it('mentions the key only where the contract puts it', { timeout: 30_000 }, () => {
    const offenders = SOURCE_FILES.filter(
      (file) =>
        KEY_MENTION.test(readFileSync(join(REPO_ROOT, file), 'utf8')) &&
        !file.startsWith(READ_WHITELIST_PREFIX) &&
        !MENTION_WHITELIST.has(file),
    )

    expect(offenders).toEqual([])
  })

  it('reads Settings.api_key in packages/llm and nowhere else', { timeout: 30_000 }, () => {
    const offenders = SOURCE_FILES.filter(
      (file) =>
        KEY_FIELD_READ.test(readFileSync(join(REPO_ROOT, file), 'utf8')) &&
        !file.startsWith(READ_WHITELIST_PREFIX),
    )

    expect(offenders).toEqual([])
  })

  it('keeps the key out of the content script entrypoint', () => {
    const content = readFileSync(join(REPO_ROOT, 'apps/extension/entrypoints/content.ts'), 'utf8')

    expect(KEY_MENTION.test(content)).toBe(false)
  })
})

describe('api key — runtime', () => {
  it('uses the key without ever logging it', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:settings': SETTINGS } })

    const result = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-1', step: STEP, input: 'page text' },
      adapter,
      { fetchImpl: okFetch },
    )

    // Not vacuous: the call really succeeded with that key.
    expect(result.ok).toBe(true)
    expect(logged.join('\n')).not.toContain(FAKE_KEY)
  })

  it('keeps the key out of the log on the failure path too', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:settings': SETTINGS } })

    await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-2', step: STEP, input: 'page text' },
      adapter,
      { fetchImpl: authFailedFetch },
    )

    // The failure path is where keys leak: an error object happily carries its request.
    expect(logged.join('\n')).not.toContain(FAKE_KEY)
  })

  it('returns no key in the reply that crosses back to the content script', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:settings': SETTINGS } })

    const success = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-3', step: STEP, input: 'page text' },
      adapter,
      { fetchImpl: okFetch },
    )
    const failure = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-4', step: STEP, input: 'page text' },
      adapter,
      { fetchImpl: authFailedFetch },
    )

    expect(JSON.stringify(success)).not.toContain(FAKE_KEY)
    expect(JSON.stringify(failure)).not.toContain(FAKE_KEY)
  })
})
