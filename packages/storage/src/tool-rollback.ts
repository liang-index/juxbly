/**
 * The background side of `tool:rollback` — `docs/ARCHITECTURE.md` §7.2 / §8.1 / §9.3
 * (stage 1-12).
 *
 * A rollback changes **which definition is in effect** and nothing else. `versions[]` is
 * left exactly as it was, including the entry that is currently in effect — which is what
 * makes "roll back to v1" reversible by rolling forward again rather than a destructive
 * act that needs a confirmation dialog (C3: no switcher UI, one secondary action).
 *
 * The version is **not** re-validated here, and that is deliberate: it was validated when
 * it was written (§5.4), and a stored definition that no longer validates is a fact the
 * user should meet at run time with a concrete error, not at rollback time with a refusal
 * that leaves them stuck on the version they were trying to leave.
 *
 * Only two answers are possible besides success, and both are reported rather than
 * swallowed: the tool is gone, or the version was never in its history.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import { createLogger } from '@juxbly/core'
import type {
  Logger,
  ToolRollbackMessage,
  ToolRollbackResultMessage,
} from '@juxbly/core'
import { rollbackTo } from '@juxbly/repair'
import { emptyHealth, emptyRunState, loadTool, writeTool } from './tools'

const log: Logger = createLogger('BUILD')

export async function handleToolRollback(
  message: ToolRollbackMessage & { toolId: string; version: number },
  adapter: BrowserAdapter,
): Promise<ToolRollbackResultMessage> {
  const record = await loadTool(adapter, message.toolId)
  if (record === null) {
    log.warn('rollback rejected: no such tool', [message.toolId])
    return { kind: 'tool:rollback_result', ok: false, error: 'TOOL_NOT_FOUND' }
  }

  const next = rollbackTo({
    record,
    version: message.version,
    at: new Date().toISOString(),
    // Restored ≠ measured: the version coming back has not run against the page as it is
    // now, so the baseline and the llm cache the *other* version left behind are dropped.
    fresh: { health: emptyHealth(), runState: emptyRunState() },
  })

  if (next === null) {
    log.warn('rollback rejected: no such version', [message.toolId, String(message.version)])
    return { kind: 'tool:rollback_result', ok: false, error: 'VERSION_NOT_FOUND' }
  }

  try {
    await writeTool(adapter, next)
  } catch (error: unknown) {
    log.warn('rollback write failed', error)
    return { kind: 'tool:rollback_result', ok: false, error: 'SAVE_FAILED' }
  }

  return { kind: 'tool:rollback_result', ok: true, version: next.definition.version }
}
