/**
 * The background side of `build:save_tool` — `docs/ARCHITECTURE.md` §7.2 / §8.1 / §9.1.
 *
 * Three rules decide everything here:
 *
 * - **Validate before writing.** `validateToolDefinition` is the only gate between model
 *   output and execution (§5.4), and the panel is not the only caller that will ever send
 *   this message. Storage is the last place an invalid definition could be stopped, so it
 *   is stopped here — for a repair as much as for a first save (§9.3 double gate).
 * - **A first save is version 1, always.** The model does not get to invent a version
 *   number, and 1-12's repair semantics depend on the first version being 1.
 * - **A repair never edits a version.** `repair` present ⇒ the write is a new version of
 *   an existing tool: `version + 1`, every old version kept, the replaced one marked
 *   `ever_broken`. Nothing here can rewrite history — only append to it.
 *
 * The reply exists because a silent failure is the worst outcome available: the user would
 * walk away believing they have a tool they do not have.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import { createLogger } from '@juxbly/core'
import type {
  BuildSaveToolMessage,
  BuildSaveToolResultMessage,
  Logger,
  RepairSaveRequest,
  ToolRecord,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { validateToolDefinition } from '@juxbly/dsl'
import { commitRepair } from '@juxbly/repair'
import {
  DEFAULT_TOOL_USAGE,
  emptyHealth,
  emptyRunState,
  loadTool,
  saveTool,
  writeTool,
} from './tools'

const log: Logger = createLogger('BUILD')

export const FIRST_VERSION = 1

export function createToolRecord(definition: ToolDefinition, at: string): ToolRecord {
  return {
    tool_id: definition.tool_id,
    // Version 1 regardless of what the model claimed: this is the first save, and every
    // later version number is derived from it (§8.1).
    definition: { ...definition, version: FIRST_VERSION },
    // `saveTool` appends the version entry itself, so the array starts empty.
    versions: [],
    health: emptyHealth(),
    run_state: emptyRunState(),
    usage: { ...DEFAULT_TOOL_USAGE },
    created_at: at,
    updated_at: at,
  }
}

export async function handleBuildSaveTool(
  message: BuildSaveToolMessage,
  adapter: BrowserAdapter,
): Promise<BuildSaveToolResultMessage> {
  const validation = validateToolDefinition(message.tool)

  if (!validation.ok) {
    const first = validation.errors[0]
    log.warn('save rejected by validation', [first?.code ?? 'VALIDATION_FAILED'])
    return { kind: 'build:save_tool_result', ok: false, error: first?.code ?? 'VALIDATION_FAILED' }
  }

  try {
    const at = new Date().toISOString()
    if (message.repair !== undefined) {
      return await saveRepairedVersion(adapter, message.repair, validation.value, at)
    }
    await saveTool(adapter, createToolRecord(validation.value, at), 'created')
    return { kind: 'build:save_tool_result', ok: true }
  } catch (error: unknown) {
    // The reason is logged, never returned: a storage error message is not something the
    // panel should echo to a user, and it can carry values from the host page.
    log.warn('save failed', error)
    return { kind: 'build:save_tool_result', ok: false, error: 'SAVE_FAILED' }
  }
}

/**
 * The repair branch (§9.3).
 *
 * The request names the tool, so the record — not the incoming definition — is the source
 * of `tool_id` and of the version being replaced. A model that renamed the tool under
 * repair would otherwise fork the history into a second tool and orphan the first.
 *
 * `TOOL_NOT_FOUND` is a real answer and not a fallback: a repair whose tool was deleted
 * mid-flow has nothing to repair, and writing a fresh record instead would resurrect it.
 */
async function saveRepairedVersion(
  adapter: BrowserAdapter,
  request: RepairSaveRequest,
  definition: ToolDefinition,
  at: string,
): Promise<BuildSaveToolResultMessage> {
  const record = await loadTool(adapter, request.toolId)
  if (record === null) {
    log.warn('repair rejected: no such tool', [request.toolId])
    return { kind: 'build:save_tool_result', ok: false, error: 'TOOL_NOT_FOUND' }
  }

  const next = commitRepair({
    record,
    // The version in effect *now* is the one this repair replaces — read from storage,
    // never from the definition the model just returned.
    origin: { trigger: request.trigger, baseVersion: record.definition.version },
    definition,
    note: request.note,
    at,
    // A new version has never run: no rolling window, no baseline, no cache (§8.1).
    fresh: { health: emptyHealth(), runState: emptyRunState() },
  })

  await writeTool(adapter, next)
  return { kind: 'build:save_tool_result', ok: true, version: next.definition.version }
}
