import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { Settings } from '@juxbly/core'
import { loadSettings, saveSettings } from '@juxbly/storage'

/**
 * `juxbly:settings` — `docs/ARCHITECTURE.md` §8.1, and the only place a BYOK key passes
 * through on its way to `chrome.storage.local`.
 *
 * §12: the key never enters the content script, the page context or a log. The key
 * assertion in this file is the one that keeps that from decaying into a comment.
 */
const FAKE_KEY = 'sk-juxbly-test-0000000000'

const SETTINGS: Settings = {
  api_key: FAKE_KEY,
  api_base_url: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  floating_ball_enabled: true,
}

let logged: string[] = []
const methods = ['info', 'warn', 'error', 'log', 'debug'] as const

beforeEach(() => {
  logged = []
  for (const method of methods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((arg) => String(arg)).join(' '))
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadSettings', () => {
  it('returns null when the settings page has never been opened', async () => {
    // No implicit defaults: "never configured" and "configured to the defaults" are
    // different states, and 1-13 has to be able to tell them apart.
    await expect(loadSettings(createMockAdapter())).resolves.toBeNull()
  })

  it('round-trips settings', async () => {
    const adapter = createMockAdapter()
    await saveSettings(adapter, SETTINGS)

    await expect(loadSettings(adapter)).resolves.toEqual(SETTINGS)
  })
})

describe('api key handling', () => {
  it('stores the key but never writes it to a log', async () => {
    const adapter = createMockAdapter()
    await saveSettings(adapter, SETTINGS)
    const stored = await loadSettings(adapter)

    // Not vacuous: the key really did travel through this module.
    expect(JSON.stringify(stored)).toContain(FAKE_KEY)
    expect(logged.join('\n')).not.toContain(FAKE_KEY)
  })

  it('keeps the key out of a log even when the read is repeated', async () => {
    const adapter = createMockAdapter()
    await saveSettings(adapter, SETTINGS)
    await loadSettings(adapter)
    await loadSettings(adapter)

    // The rule is about the module, not about one call: any future logging added to the
    // read path fails here.
    expect(logged.join('\n')).not.toContain(FAKE_KEY)
  })
})
