// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractCapability, runExtract } from '@juxbly/capabilities'
import type { ExtractStep } from '@juxbly/dsl'
import { createFixtureHost } from '../../../fixtures/page-host'
import { ctxWithLog } from '../ctx'

/**
 * The declaration is part of the contract, not paperwork: `permissions` and
 * `securityNotes` are what a reviewer of a new capability checks first (CONVENTIONS §5),
 * and `dom.read` is the only permission this capability may ever need.
 */
const STEP: ExtractStep = {
  type: 'extract',
  mode: 'list',
  selector: '.results li.product',
  fields: { title: '.title', price: '.price' },
  output_to: 'products',
}

describe('extractCapability: declaration', () => {
  it('needs dom.read and nothing else', () => {
    expect(extractCapability.type).toBe('extract')
    expect(extractCapability.permissions).toEqual(['dom.read'])
  })

  it('states what it writes, and that it writes nothing', () => {
    expect(extractCapability.securityNotes).toMatch(/read-only/i)
    expect(extractCapability.securityNotes).toMatch(/never writes the DOM/i)
    expect(extractCapability.securityNotes).toMatch(/never evaluates a string/i)
  })

  it('declares both schemas', () => {
    expect(extractCapability.inputSchema).toMatchObject({ type: 'object' })
    expect(extractCapability.outputSchema).toMatchObject({ type: 'object' })
  })
})

describe('extractCapability.execute', () => {
  it('returns the §5.5 ExtractResult shape', async () => {
    const host = createFixtureHost('list-page.html')
    const { ctx } = ctxWithLog()
    ctx.ports.dom = host.dom

    const result = await extractCapability.execute({ step: STEP, items: [] }, ctx)

    expect(result.hitCount).toBe(4)
    expect(result.missingFields).toEqual([])
    expect(result.truncated).toBe(false)
    expect(result.fieldPresence).toEqual({ title: 1, price: 1 })
  })

  it('logs counts and field names, never a value', async () => {
    // The records are page content: a log line that carried one would put it in the host
    // page's console and in anything collecting it.
    const host = createFixtureHost('list-page.html')
    const { ctx, logged } = ctxWithLog()
    ctx.ports.dom = host.dom

    await extractCapability.execute({ step: STEP, items: [] }, ctx)

    const line = logged.map((parts) => parts.join(' ')).join(' | ')
    expect(line).toContain('extract')
    expect(line).toContain('4')
    expect(line).not.toContain('Wireless')
    expect(line).not.toContain('$49.00')
  })

  it('ignores the incoming items: extract produces data, it consumes none', async () => {
    const host = createFixtureHost('list-page.html')

    const result = await runExtract(
      { step: STEP, items: [{ title: 'stale', price: 'stale' }] },
      host.dom,
    )

    expect(result.items[0]).toEqual({ title: 'Wireless keyboard', price: '$49.00' })
  })
})
