import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createChromeAdapter, createMockAdapter } from '@juxbly/browser'
import type { BrowserAdapter } from '@juxbly/browser'
import { chromeHarness, mockHarness, restoreGlobals, SCREENSHOT } from './harness'
import type { Harness } from './harness'

/**
 * Both `BrowserAdapter` implementations, through one suite.
 *
 * `docs/ARCHITECTURE.md` §6.4 gives the mock a job: it is what every later stage tests
 * against. A mock that drifts from the chrome implementation — `null` where chrome
 * throws, a resolved promise where chrome rejects — produces green tests and a broken
 * extension, and nothing in the repository would notice. This file is where it is
 * noticed.
 */

/** `docs/ARCHITECTURE.md` §6.4 — the confirmed minimal set. */
const CONFIRMED_PORTS = ['clipboard', 'downloads', 'messaging', 'storage']

function portMethods(port: object): string[] {
  return Object.keys(port).sort()
}

function describeAdapter(name: string, create: () => Harness): void {
  describe(name, () => {
    let harness: Harness

    beforeEach(() => {
      harness = create()
    })

    afterEach(() => {
      restoreGlobals()
    })

    it('reads a missing key as null instead of throwing', async () => {
      // The error semantics matter more than the happy path: every first run reads keys
      // that do not exist yet.
      await expect(harness.adapter.storage.get('juxbly:settings')).resolves.toBeNull()
    })

    it('round-trips a stored value', async () => {
      await harness.adapter.storage.set('juxbly:onboarding', { first_tool_built: true })
      await expect(harness.adapter.storage.get('juxbly:onboarding')).resolves.toEqual({
        first_tool_built: true,
      })
    })

    it('removes a stored value', async () => {
      await harness.adapter.storage.set('juxbly:tools', { tool_1: {} })
      await harness.adapter.storage.remove('juxbly:tools')
      await expect(harness.adapter.storage.get('juxbly:tools')).resolves.toBeNull()
    })

    it('writes text to the clipboard', async () => {
      await harness.adapter.clipboard.writeText('a,b,c')
      expect(harness.clipboard).toEqual(['a,b,c'])
    })

    it('downloads the content under the given filename', async () => {
      await harness.adapter.downloads.download('rows.csv', 'a,b\n1,2\n', 'text/csv')

      expect(harness.downloads).toHaveLength(1)
      const download = harness.downloads[0]
      expect(download?.filename).toBe('rows.csv')
      await expect(download?.content).resolves.toBe('a,b\n1,2\n')
    })

    it('sends a message and returns the reply', async () => {
      await expect(
        harness.adapter.messaging.send({ kind: 'internal:ping' }),
      ).resolves.toEqual({ kind: 'internal:pong', ok: true })
    })

    it('returns null when nothing answers a message', async () => {
      await expect(harness.adapter.messaging.send({ kind: 'settings:get' })).resolves.toBeNull()
    })

    it('delivers a pushed message and honours unsubscribe', () => {
      const seen: unknown[] = []
      const unsubscribe = harness.adapter.messaging.onMessage((message: unknown) => {
        seen.push(message)
      })

      harness.dispatchIncoming({ kind: 'internal:command', command: 'toggle-juxbly' })
      unsubscribe()
      harness.dispatchIncoming({ kind: 'internal:command', command: 'toggle-juxbly' })

      expect(seen).toEqual([{ kind: 'internal:command', command: 'toggle-juxbly' }])
    })

    it('captures the tab as a data url', async () => {
      await expect(harness.adapter.messaging.captureTab()).resolves.toBe(SCREENSHOT)
    })
  })
}

describeAdapter('chrome implementation', chromeHarness)
describeAdapter('mock implementation', mockHarness)

describe('browser adapter implementations', () => {
  it('exposes the same ports and methods in both implementations', () => {
    const shapeOf = (adapter: BrowserAdapter): Record<string, string[]> => ({
      clipboard: portMethods(adapter.clipboard),
      downloads: portMethods(adapter.downloads),
      messaging: portMethods(adapter.messaging),
      storage: portMethods(adapter.storage),
    })

    // The pair is the contract: a port that exists in only one implementation is a test
    // that cannot be written, or production code that was never tested.
    expect(shapeOf(createChromeAdapter())).toEqual(shapeOf(createMockAdapter()))
  })

  it('keeps the adapter to the four confirmed ports', () => {
    // `docs/ARCHITECTURE.md` §6.4: storage, clipboard, downloads, messaging. Anything else
    // — a `tabs` port above all — is a permission decision, not an adapter detail.
    expect(portMethods(createChromeAdapter())).toEqual(CONFIRMED_PORTS)
    for (const port of CONFIRMED_PORTS) {
      expect(createMockAdapter()).toHaveProperty(port)
    }
  })
})
