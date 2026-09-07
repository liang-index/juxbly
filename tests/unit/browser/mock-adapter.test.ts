import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { MockCall } from '@juxbly/browser'

/**
 * The mock's own job: being assertable. Later stages need to prove that a write happened,
 * that it did not happen, and with what arguments — without standing up a browser.
 */
function methodsOf(calls: readonly MockCall[]): string[] {
  return calls.map((call) => call.method)
}

describe('mock adapter', () => {
  it('starts empty and records every call in order', async () => {
    const adapter = createMockAdapter()

    await adapter.storage.set('juxbly:tools', {})
    await adapter.clipboard.writeText('copied')

    expect(methodsOf(adapter.calls)).toEqual(['storage.set', 'clipboard.writeText'])
  })

  it('exposes what was written, so an assertion does not need a second read', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:tools': { tool_1: {} } } })

    await expect(adapter.storage.get('juxbly:tools')).resolves.toEqual({ tool_1: {} })
    expect(adapter.data.get('juxbly:tools')).toEqual({ tool_1: {} })
  })

  it('records download arguments as filename, content and mime type', async () => {
    const adapter = createMockAdapter()

    await adapter.downloads.download('rows.csv', 'a,1\n', 'text/csv')

    const call = adapter.calls[0]
    expect(call?.method).toBe('downloads.download')
    expect(call?.args).toEqual(['rows.csv', 'a,1\n', 'text/csv'])
  })

  it('answers messages through the injected handler and nothing else', async () => {
    const adapter = createMockAdapter({ onSend: () => ({ kind: 'internal:pong', ok: true }) })

    await expect(adapter.messaging.send({ kind: 'internal:ping' })).resolves.toEqual({
      kind: 'internal:pong',
      ok: true,
    })
  })

  it('has no remote behaviour at all: no handler means no answer', async () => {
    const adapter = createMockAdapter()

    await expect(adapter.messaging.send({ kind: 'settings:get' })).resolves.toBeNull()
    await expect(adapter.messaging.captureTab()).resolves.toBe('')
  })
})
