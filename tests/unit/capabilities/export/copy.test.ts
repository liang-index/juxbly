import { describe, expect, it } from 'vitest'
import type { ExportResult } from '@juxbly/core'
import { exportCapability, toCopyText } from '@juxbly/capabilities/export'
import type { ExportStep } from '@juxbly/dsl'
import { ctxWithLog } from '../ctx'

/**
 * The `export` capability and the copy serialiser — `task/stage-1-15.md` Tests.
 *
 * Copy is the one format that does not leave the machine through the download manager, so
 * its guarantee is different: the clipboard port gets the readable text and nothing else is
 * called. The browser's own gesture requirement (clipboard only works in a focused click)
 * is not something a test can fake — the *behavioural* rule is that copy never happens from
 * an automatic step, which is why only the panel button delivers it (see export-actions).
 */
const STEP: ExportStep = { type: 'export', format: 'copy', input_from: 'items' }
const ROWS = [{ title: 'Apple', price: 1 }, { title: 'Pear', price: 2 }]

describe('toCopyText', () => {
  it('lays records out as key: value lines separated by blank lines', () => {
    expect(toCopyText(ROWS)).toBe('title: Apple\nprice: 1\n\ntitle: Pear\nprice: 2')
  })

  it('turns an image value into "alt (src)" and stringifies nested values', () => {
    const rows = [{ img: { src: 'a.png', alt: 'A' }, extra: { x: 1 } }]
    expect(toCopyText(rows)).toBe('img: A (a.png)\nextra: {"x":1}')
  })
})

describe('exportCapability', () => {
  it('declares the two permissions the formats need', () => {
    expect(exportCapability.permissions).toEqual(['clipboard.write', 'downloads'])
    expect(exportCapability.securityNotes.length).toBeGreaterThan(0)
  })

  it('writes the read-only text to the clipboard and reports its size', async () => {
    const { ctx, logged } = ctxWithLog()
    let written = ''
    ctx.ports.clipboard = { writeText: (text) => (written = text, Promise.resolve()) }

    const result = await exportCapability.execute({ step: STEP, items: ROWS }, ctx)

    expect(written).toBe(toCopyText(ROWS))
    expect(result).toEqual({ format: 'copy', itemCount: 2, bytes: written.length })
    // Shape only: the log never carries the copied content, only the format and count.
    expect(logged).toEqual([['CAPABILITY', 'export', 'copy', '2']])
  })

  it('logs format and count, never the exported content', async () => {
    const { ctx, logged } = ctxWithLog()
    ctx.ports.clipboard = { writeText: () => Promise.resolve() }
    await exportCapability.execute({ step: STEP, items: ROWS }, ctx)
    expect(JSON.stringify(logged)).not.toContain('Apple')
  })

  it('keeps copy purely on the clipboard port — downloads is never reached', async () => {
    const { ctx } = ctxWithLog()
    ctx.ports.clipboard = { writeText: () => Promise.resolve() }
    // ctxStub's downloads port throws; a copy path that reached for it would reject here.
    await expect(exportCapability.execute({ step: STEP, items: ROWS }, ctx)).resolves.toMatchObject({
      format: 'copy',
    })
  })
})

describe('csv / json capability paths', () => {
  it('routes csv through the downloads port with a text/csv mime', async () => {
    const { ctx } = ctxWithLog()
    const received: Array<[string, string]> = []
    ctx.ports.downloads = {
      download: (filename, content, mime) => {
        expect(mime).toBe('text/csv;charset=utf-8')
        received.push([filename, content])
        return Promise.resolve()
      },
    }

    const result = await exportCapability.execute(
      { step: { type: 'export', format: 'csv', input_from: 'items' }, items: ROWS },
      ctx,
    )

    expect(received).toHaveLength(1)
    expect(received[0]?.[1].startsWith('\uFEFF')).toBe(true)
    expect(result.format).toBe('csv')
    expect((result as ExportResult).bytes).toBe(received[0]?.[1].length)
  })

  it('routes json through the downloads port with an application/json mime', async () => {
    const { ctx } = ctxWithLog()
    let mime = ''
    let content = ''
    ctx.ports.downloads = {
      download: (_filename, body, value) => {
        mime = value
        content = body
        return Promise.resolve()
      },
    }

    const result = await exportCapability.execute(
      { step: { type: 'export', format: 'json', input_from: 'items' }, items: ROWS },
      ctx,
    )
    expect(mime).toBe('application/json')
    expect(content.startsWith('\uFEFF')).toBe(false)
    expect(JSON.parse(content)).toEqual(ROWS)
    expect(result.format).toBe('json')
  })

  it('propagates a refused download as a failure', async () => {
    const { ctx } = ctxWithLog()
    ctx.ports.downloads = {
      download: () => Promise.reject(new Error('quota exceeded')),
    }
    await expect(
      exportCapability.execute({ step: { type: 'export', format: 'csv', input_from: 'items' }, items: ROWS }, ctx),
    ).rejects.toThrow('quota exceeded')
  })
})