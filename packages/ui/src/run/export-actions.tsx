import type { BrowserAdapter } from '@juxbly/browser'
import {
  cleanFilename,
  timestampSuffix,
  toCopyText,
  toCsv,
  toJson,
} from '@juxbly/capabilities/export'
import type { ExportFormat } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { useState, type ReactNode } from 'react'
import { t } from '../copy'

/**
 * The run panel's export actions — `docs/UI_SPEC.md` §7.3 ③, `task/stage-1-15.md` UI.
 *
 * Three formats, three buttons, all resident in the action area — never folded into a menu.
 * The serialisers are the same ones the `export` capability uses, imported from
 * `@juxbly/capabilities/export` so the panel and the DSL step agree on every byte.
 *
 * Two delivery rules that a refactor could silently break, kept here in the open:
 *
 * - **Copy is user-initiated.** `navigator.clipboard` only works in a focused, clicked
 *   context, and a tool that auto-runs must never write the clipboard by itself — which is
 *   why copy is delivered by this button and not by a DSL `export:copy` step in an
 *   automatic run.
 * - **A refused export is a visible error, never silence.** The background answers the
 *   download request; a `ok: false` reply (permission gap, quota, an intercepting browser)
 *   becomes an error line with a working retry — the button simply still being enabled.
 *
 * While one format is running all three are disabled (mutual exclusion, §7).
 */
export function ExportActions({
  adapter,
  tool,
  items,
}: {
  adapter: BrowserAdapter
  tool: ToolDefinition
  items: readonly Record<string, unknown>[]
}): ReactNode {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const run = async (format: ExportFormat): Promise<void> => {
    // One download at a time: a second click while the first is out must not double-export.
    if (busy !== null) return

    setBusy(format)
    setFeedback(null)
    try {
      if (format === 'copy') {
        await adapter.clipboard.writeText(toCopyText(items))
      } else {
        await downloadResult(adapter, tool, format, items)
      }
      // Usage is recorded only once the delivery actually succeeded.
      await adapter.messaging.send({ kind: 'export:record_usage', toolId: tool.tool_id })
      setFeedback({
        tone: 'ok',
        text: format === 'copy' ? t('run.export.copied') : t('run.export.downloading'),
      })
    } catch {
      setFeedback({ tone: 'error', text: t('run.export.failed') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="jx-run-export">
      <div className="jx-run-export-buttons">
        <button
          type="button"
          className="jx-chip jx-chip--action"
          aria-label={t('run.export.aria.copy')}
          disabled={busy !== null}
          onClick={() => void run('copy')}
        >
          {t('run.export.copy')}
        </button>
        <button
          type="button"
          className="jx-chip jx-chip--action"
          aria-label={t('run.export.aria.csv')}
          disabled={busy !== null}
          onClick={() => void run('csv')}
        >
          {t('run.export.csv')}
        </button>
        <button
          type="button"
          className="jx-chip jx-chip--action"
          aria-label={t('run.export.aria.json')}
          disabled={busy !== null}
          onClick={() => void run('json')}
        >
          {t('run.export.json')}
        </button>
      </div>
      {feedback === null ? null : (
        <p className="jx-run-export-feedback" data-tone={feedback.tone}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}

/**
 * CSV and JSON both reach the download manager through the background — this content-script
 * side only sends the §7.2 message and treats a refused reply as a failure.
 */
async function downloadResult(
  adapter: BrowserAdapter,
  tool: ToolDefinition,
  format: 'csv' | 'json',
  items: readonly Record<string, unknown>[],
): Promise<void> {
  const content = format === 'csv' ? toCsv(items) : toJson(items)
  const filename = `${cleanFilename(tool.name)}-${timestampSuffix(new Date())}.${format}`
  const message =
    format === 'csv'
      ? ({ kind: 'export:download_csv', filename, csv: content } as const)
      : ({ kind: 'export:download_json', filename, json: content } as const)

  const reply = await adapter.messaging.send(message)
  if (reply === null || reply.kind !== 'export:download_result' || !reply.ok) {
    const reason = reply !== null && reply.kind === 'export:download_result' ? reply.error : 'NO_REPLY'
    throw new Error(reason ?? 'NO_REPLY')
  }
}