// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { ToolRecord, ToolUsage } from '@juxbly/core'
import { DEFAULT_TOOL_USAGE, loadTool, TOOLS_KEY } from '@juxbly/storage'
import { cleanFilename } from '@juxbly/capabilities/export'
import {
  handleExportDownload,
  handleExportRecordUsage,
} from '../../apps/extension/entrypoints/background'

/**
 * The export download flow — `task/stage-1-15.md` Tests, `docs/ARCHITECTURE.md` §7.1.
 *
 * What this flow guarantees is that a **message to the background** is the only route to
 * the download manager, and that a refused download is reported (so usage is not recorded)
 * rather than silently lost. The content side never calls `chrome.downloads`; the
 * background handler owns the real call and answers `ok: false` when it fails.
 */
const AT = '2026-09-07T12:00:00.000Z'

function seededAdapter(): ReturnType<typeof createMockAdapter> {
  const record: ToolRecord = {
    tool_id: 'tool_1',
    definition: {
      tool_id: 'tool_1',
      name: 'Prices',
      category: 'data',
      url_pattern: 'example.com/*',
      version: 1,
      steps: [{ type: 'extract', mode: 'single', fields: { p: '.p' }, output_to: 'raw' }],
      created_at: AT,
      updated_at: AT,
    },
    versions: [],
    health: {
      status: 'healthy',
      recent_runs: [],
      structure_fingerprint: null,
      last_semantic_check: null,
      consecutive_clean_runs: 0,
    },
    run_state: { last_extract_hash: null, last_llm_outputs: {} },
    usage: { ...DEFAULT_TOOL_USAGE },
    created_at: AT,
    updated_at: AT,
  }
  return createMockAdapter({ storage: { [TOOLS_KEY]: { tool_1: record } } })
}

describe('export download flow', () => {
  it('reaches the download manager through the background handler, not the page', async () => {
    const adapter = createMockAdapter()
    const message = {
      kind: 'export:download_csv' as const,
      filename: 'Prices-my-shop.csv',
      csv: '\uFEFFname\r\na,b',
    }

    const reply = await handleExportDownload(adapter, message, message.filename, message.csv)

    expect(reply).toEqual({ kind: 'export:download_result', ok: true })
    const [calledFilename, , mime] = adapter.calls.find(
      (call) => call.method === 'downloads.download',
    )?.args as [string, string, string]
    expect(calledFilename).toBe('Prices-my-shop.csv')
    expect(mime).toBe('text/csv;charset=utf-8')
  })

  it('sanitises a hostile filename before it reaches the download manager', async () => {
    const adapter = createMockAdapter()
    const nasty = { kind: 'export:download_json' as const, filename: '../../\\evil name.json', json: '[]' }

    await handleExportDownload(adapter, nasty, nasty.filename, nasty.json)

    const calledFilename = adapter.calls.find((call) => call.method === 'downloads.download')
      ?.args[0] as string
    expect(calledFilename).toBe(cleanFilename('evil name.json'))
    expect(calledFilename).not.toContain('/')
    expect(calledFilename).not.toContain('..')
  })

  it('returns ok:false when the download manager refuses, without recording usage', async () => {
    const adapter = seededAdapter()
    adapter.downloads = {
      download: () => Promise.reject(new Error('downloads blocked')),
    }
    const message = { kind: 'export:download_csv' as const, filename: 'p.csv', csv: '\uFEFFa' }

    const reply = await handleExportDownload(adapter, message, message.filename, message.csv)

    expect(reply.ok).toBe(false)
    expect((reply as { error?: string }).error).toBe('downloads blocked')
    // Usage is recorded by a *separate* success-only message; a refused download changed
    // nothing here.
    expect(adapter.calls.filter((call) => call.method === 'storage.set')).toHaveLength(0)
  })
})

describe('export usage recording', () => {
  it('counts one export and refreshes last_export_at', async () => {
    const adapter = seededAdapter()

    await handleExportRecordUsage(adapter, 'tool_1')

    const tool = await loadTool(adapter, 'tool_1')
    expect(tool?.usage.export_count).toBe(1)
    expect(tool?.usage.last_export_at).not.toBeNull()
    // A record of the write uses the same key the management surface reads (§8.1).
    expect((tool?.usage as ToolUsage).run_count).toBe(0)
  })
})