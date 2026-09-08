/**
 * The `export` capability — `docs/ARCHITECTURE.md` §5.2 / §6.1 / §6.3, `task/stage-1-15.md`.
 *
 * The last of the five V1 capabilities, and the one that delivers the result out of the
 * extension: `copy` puts it on the clipboard, `csv` / `json` hand it to the browser's
 * download manager. The serialisers here are shared with the run panel's action area —
 * the same three functions drive a DSL `export` step and the Copy / CSV / JSON buttons —
 * which is why they live in `packages/capabilities/src/export/` and not in the UI.
 *
 * Two delivery rules that are easy to break in a refactor, kept visible next to the code:
 *
 * - **Downloads run only in the background.** The platform's `downloads` API is not
 *   available in a content script, so this capability never touches `ctx.ports.downloads`
 *   for JSON/CSV directly *from the page* — the port is wired in the content script as a
 *   relay that sends `export:download_csv` / `export:download_json`, and the background
 *   owns the real platform `downloads` call (§7.1, AC4).
 * - **Copy needs a user gesture.** `navigator.clipboard.writeText` only works in a focused,
 *   user-initiated context; a tool that auto-runs on page load must not silently write the
 *   clipboard. The run engine **refuses** an `export:copy` step outright (enforced in
 *   `packages/runtime/src/tool-runtime.ts`, pinned by a test) — copy is delivered by the
 *   panel button, which is always a real click and never goes through a step.
 *
 * JSON and CSV go through `downloads` together (`docs/ARCHITECTURE.md` §7.3): adding the
 * `json` format added no permission, and no future format should be assumed to re-add one.
 */
import type { CapabilityDefinition, CapabilityInput, ExecutionContext, ExportResult } from '@juxbly/core'
import type { ExportStep } from '@juxbly/dsl'
import { CapabilityError } from '../errors'
import { toCopyText } from './copy'
import { toCsv } from './csv'
import { cleanFilename, timestampSuffix } from './filename'
import { toJson } from './json'

export { cleanFilename, timestampSuffix } from './filename'
export { toCopyText } from './copy'
export { toCsv, serializeCsv } from './csv'
export { toJson } from './json'

// Delivers one step's rows out of the extension. `copy` walks the clipboard, `csv` /
// `json` walk the download manager — neither records usage itself (a capability has no
// tool id; the panel that triggered the export does that with the one
// `export:record_usage` hop, §7.2).
export function runExport(input: CapabilityInput<ExportStep>, ctx: ExecutionContext): Promise<ExportResult> {
  const { step, items } = input

  if (!Array.isArray(items)) {
    throw new CapabilityError('INPUT_NOT_ARRAY', `export expected an array of records, got ${typeof items}`)
  }

  switch (step.format) {
    case 'copy': {
      // A real click is the only caller of the copy path (see the header note on gestures).
      const text = toCopyText(items)
      return ctx.ports.clipboard.writeText(text).then(() => ({
        format: 'copy',
        itemCount: items.length,
        bytes: text.length,
      }))
    }
    case 'csv': {
      const csv = toCsv(items)
      const filename = exportFilename('csv')
      return ctx.ports.downloads.download(filename, csv, 'text/csv;charset=utf-8').then(() => ({
        format: 'csv',
        itemCount: items.length,
        bytes: csv.length,
      }))
    }
    case 'json': {
      const json = toJson(items)
      const filename = exportFilename('json')
      return ctx.ports.downloads.download(filename, json, 'application/json').then(() => ({
        format: 'json',
        itemCount: items.length,
        bytes: json.length,
      }))
    }
  }
}

export const exportCapability: CapabilityDefinition<CapabilityInput<ExportStep>, ExportResult> = {
  type: 'export',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['step', 'items'],
    properties: {
      step: { type: 'object', required: ['type', 'format', 'input_from'] },
      items: { type: 'array', items: { type: 'object' } },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['format', 'itemCount'],
    properties: {
      format: { enum: ['copy', 'csv', 'json'] },
      itemCount: { type: 'integer', minimum: 0 },
      bytes: { type: 'integer', minimum: 0 },
    },
  },
  // copy needs clipboard access, csv/json need the download manager. The `json` format
  // reuses `downloads`; no new permission was introduced by adding it (§7.3).
  permissions: ['clipboard.write', 'downloads'],
  securityNotes:
    'Exports page-derived content, which is untrusted: CSV cells are prefix-neutralised against formula injection and the filename is sanitised (no path separators or control characters). copy is only delivered from a user-initiated panel click. The exported content itself is never logged and never travels back in a message; download routes through the background because the platform `downloads` API is unavailable to content scripts (ARCHITECTURE §7.1).',

  execute(input, ctx): Promise<ExportResult> {
    // Shape and count only — the rows are page content and must never be logged.
    ctx.ports.log({
      tag: 'CAPABILITY',
      message: 'export',
      details: [input.step.format, input.items.length],
    })
    return runExport(input, ctx)
  },
}

/**
 * A default name for an `export` step that has no name of its own (the DSL `ExportStep`
 * carries only `input_from` and `format`). The panel uses a more informative name derived
 * from the tool; timestamps keep consecutive exports from overwriting each other (§7.3).
 */
function exportFilename(extension: 'csv' | 'json'): string {
  return `${cleanFilename('juxbly-export')}-${timestampSuffix(new Date())}.${extension}`
}