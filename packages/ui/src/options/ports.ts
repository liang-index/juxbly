/**
 * The options page's way out of itself — `docs/ARCHITECTURE.md` §7.2.
 *
 * Three calls, and the reason each exists rather than reading storage directly:
 *
 * - `settings:manage` is answered to the extension's own page and carries the endpoint,
 *   the model and a *masked* key hint. `settings:get` — the one the content script gets —
 *   must never grow those fields, or every one of them becomes readable from the page
 *   context (§12.2).
 * - `settings:set` is the write, and the background sanitises it. The patch is built by
 *   `buildSettingsPatch` (`@juxbly/core`) so no UI file ever spells the credential field.
 * - `llm:connectivity` tests a candidate the user has not saved yet. It exists because the
 *   test has to be possible *before* committing: a user configuring Juxbly offline has to
 *   be able to save, and "the test failed" is not a reason to lose what they typed.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { Settings, SettingsView, ToolOverviewItem, UsageStats } from '@juxbly/core'

export interface ManagePorts {
  listTools(): Promise<ToolOverviewItem[]>
  stats(): Promise<UsageStats>
  /** Removal is the only exit a tool has (C1: no archive), and it is confirmed upstream. */
  deleteTool(toolId: string): Promise<boolean>
}

export interface SettingsPorts {
  load(): Promise<SettingsView>
  /** `false` means nothing survived sanitisation — the panel says so instead of lying. */
  save(patch: Partial<Settings>): Promise<boolean>
  /** `null` on success, otherwise an `LlmErrorCode` as a string. */
  test(patch: Partial<Settings>): Promise<string | null>
}

/** Reply codes the panel turns into copy. Stable and English (§7.2). */
export const NO_REPLY = 'NO_REPLY'

export function createSettingsPorts(adapter: BrowserAdapter): SettingsPorts {
  return {
    async load(): Promise<SettingsView> {
      const reply = await adapter.messaging.send({ kind: 'settings:manage' })
      if (reply === null || reply.kind !== 'settings:manage_result') {
        return {
          key_set: false,
          key_hint: null,
          api_base_url: null,
          model: null,
          floating_ball_enabled: true,
        }
      }

      return {
        key_set: reply.key_set === true,
        key_hint: reply.key_hint ?? null,
        api_base_url: reply.api_base_url ?? null,
        model: reply.model ?? null,
        floating_ball_enabled: reply.floating_ball_enabled !== false,
      }
    },

    async save(patch: Partial<Settings>): Promise<boolean> {
      const reply = await adapter.messaging.send({ kind: 'settings:set', patch })
      if (reply === null || reply.kind !== 'settings:set_result') return false
      return reply.ok === true
    },

    async test(patch: Partial<Settings>): Promise<string | null> {
      const reply = await adapter.messaging.send({ kind: 'llm:connectivity', settings: patch })
      if (reply === null || reply.kind !== 'llm:connectivity_result') return NO_REPLY
      if (reply.ok) return null
      return reply.error ?? NO_REPLY
    },
  }
}

/**
 * The management surface's two calls (stage 1-13 AC 6 / AC 10).
 *
 * The list is the same `tool:list` the popup uses — one assembly of "a row", one
 * definition of its ordering, in both surfaces.
 */
export function createManagePorts(adapter: BrowserAdapter): ManagePorts {
  return {
    async listTools(): Promise<ToolOverviewItem[]> {
      const reply = await adapter.messaging.send({ kind: 'tool:list' })
      if (reply === null || reply.kind !== 'tool:list_result') return []
      return reply.tools ?? []
    },

    async stats(): Promise<UsageStats> {
      const reply = await adapter.messaging.send({ kind: 'stats:get' })
      if (reply === null || reply.kind !== 'stats:get_result') {
        return { totalTools: 0, addedThisWeek: 0, totalRuns: 0 }
      }
      return reply.stats
    },

    async deleteTool(toolId: string): Promise<boolean> {
      const reply = await adapter.messaging.send({ kind: 'tool:delete', toolId })
      if (reply === null || reply.kind !== 'tool:delete_result') return false
      return reply.ok === true
    },
  }
}
