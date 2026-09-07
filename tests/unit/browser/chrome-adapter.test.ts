import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChromeAdapter } from '@juxbly/browser'
import { chromeHarness, restoreGlobals } from './harness'

/**
 * What the chrome implementation is responsible for beyond the shared behaviour in
 * `adapter-implementations.test.ts`: it must not hold on to the platform.
 *
 * An MV3 service worker is stopped and recreated without warning, and a content script
 * shares its world with a page it does not control, so an adapter that captured the
 * platform namespace once would hand out a dead reference — the exact failure that looks
 * like "storage randomly stopped working".
 */
describe('chrome adapter', () => {
  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('can be created without the platform being present at all', () => {
    expect((globalThis as { chrome?: unknown }).chrome).toBeUndefined()
    expect(() => createChromeAdapter()).not.toThrow()
  })

  it('fails loudly instead of pretending a call succeeded', async () => {
    const adapter = createChromeAdapter()

    // A silent no-op here would surface much later as "my tools are gone".
    await expect(adapter.storage.get('juxbly:tools')).rejects.toThrow(/unavailable/)
    await expect(adapter.clipboard.writeText('x')).rejects.toThrow(/unavailable/)
  })

  it('looks the platform up on every call, so a recycled worker cannot leave it stale', async () => {
    const harness = chromeHarness()
    const adapter = createChromeAdapter()

    await adapter.storage.set('juxbly:settings', { model: 'gpt-4o-mini' })
    await expect(adapter.storage.get('juxbly:settings')).resolves.toEqual({ model: 'gpt-4o-mini' })
    expect(harness.adapter).toBeDefined()

    restoreGlobals()
    await expect(adapter.storage.get('juxbly:settings')).rejects.toThrow(/unavailable/)
  })

  it('revokes the blob url it created for a download', async () => {
    chromeHarness()
    const revoked = vi.spyOn(URL, 'revokeObjectURL')
    const adapter = createChromeAdapter()

    await adapter.downloads.download('rows.json', '[]', 'application/json')

    // Without this, every exported file stays pinned in memory until the page or worker
    // goes away.
    expect(revoked).toHaveBeenCalledTimes(1)
  })
})
