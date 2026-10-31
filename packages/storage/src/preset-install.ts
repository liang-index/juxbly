/**
 * The background side of `preset:install` (stage 3-2 Track B) — `docs/ARCHITECTURE.md` §7.3.
 *
 * Two rules, both inherited from the build save rather than invented here:
 *
 * - **Validate before writing.** A preset is bundled data, but it still crossed the
 *   runtime message boundary, and "curated" is not a trust level — the same §5.4 gate
 *   that stops a model draft stops a preset too.
 * - **No silent double install.** The record exists ⇒ `ALREADY_INSTALLED`. Stacking an
 *   identical v2 onto the history would make the rollback list lie about what happened,
 *   and "install" is not an edit.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { PresetInstallMessage, PresetInstallResultMessage } from '@juxbly/core'
import { createLogger } from '@juxbly/core'
import { validateToolDefinition } from '@juxbly/dsl'
import { createToolRecord } from './build-save'
import { loadTool, saveTool } from './tools'

const log = createLogger('BUILD')

export async function handlePresetInstall(
  message: PresetInstallMessage,
  adapter: BrowserAdapter,
): Promise<PresetInstallResultMessage> {
  const validation = validateToolDefinition(message.tool)
  if (!validation.ok) {
    const first = validation.errors[0]
    log.warn('preset rejected by validation', [first?.code ?? 'VALIDATION_FAILED'])
    return { kind: 'preset:install_result', ok: false, error: 'VALIDATION_FAILED' }
  }

  const existing = await loadTool(adapter, validation.value.tool_id)
  if (existing !== null) {
    // Not an error to apologise for: the tool the user is asking for is already there.
    log.info('preset already installed', [validation.value.tool_id])
    return { kind: 'preset:install_result', ok: false, error: 'ALREADY_INSTALLED' }
  }

  try {
    await saveTool(adapter, createToolRecord(validation.value, new Date().toISOString()), 'created')
    return { kind: 'preset:install_result', ok: true }
  } catch (error: unknown) {
    // The reason is logged, never returned: a storage error message is not user copy
    // and can carry values the record holds (same discipline as the build save).
    log.warn('preset install failed', error)
    return { kind: 'preset:install_result', ok: false, error: 'SAVE_FAILED' }
  }
}
