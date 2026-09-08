/**
 * The background side of `build:save_tool` — `docs/ARCHITECTURE.md` §7.2 / §8.1 / §9.1.
 *
 * Two rules decide everything here:
 *
 * - **Validate before writing.** `validateToolDefinition` is the only gate between model
 *   output and execution (§5.4), and the panel is not the only caller that will ever send
 *   this message. Storage is the last place an invalid definition could be stopped, so it
 *   is stopped here.
 * - **A first save is version 1, always.** The model does not get to invent a version
 *   number, and 1-12's repair semantics depend on the first version being 1.
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
  ToolRecord,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { validateToolDefinition } from '@juxbly/dsl'
import { DEFAULT_TOOL_USAGE, emptyHealth, emptyRunState, saveTool } from './tools'

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
    await saveTool(adapter, createToolRecord(validation.value, at), 'created')
    return { kind: 'build:save_tool_result', ok: true }
  } catch (error: unknown) {
    // The reason is logged, never returned: a storage error message is not something the
    // panel should echo to a user, and it can carry values from the host page.
    log.warn('save failed', error)
    return { kind: 'build:save_tool_result', ok: false, error: 'SAVE_FAILED' }
  }
}
