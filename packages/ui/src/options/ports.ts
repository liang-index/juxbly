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
import type { ToolDefinition } from '@juxbly/dsl'
// The URL→origin-pattern helper landed in the popup's ports (stage 3-2); the BYOK form
// needs the same derivation for a custom endpoint, and a second spelling of it is a
// second place for the Policy Surface to drift.
import { originPatternOf } from '../popup/ports'

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
  /**
   * Stage 3-2 (the Policy Surface, §7.3): make sure the background may fetch the
   * endpoint, asking only when the origin is not already granted. A blank endpoint is
   * the default provider — the store manifest's one static host — so there is nothing to
   * ask. Must be called from a click handler: `permissions.request` needs a gesture.
   * `false` means the user declined; the settings still save (they are local), and the
   * connection test is where the gap becomes visible.
   */
  ensureEndpointAccess(endpoint: string): Promise<boolean>
}

/**
 * One card of the preset pack (stage 3-2 Track B). Built from a packed recipe by the
 * entrypoint — the UI never imports the bundle itself, so the pack's data shape stays a
 * decision of the app, not of the page that displays it.
 */
export interface PresetItem {
  /** The recipe directory name — stable, and the key the drift test knows. */
  id: string
  title: string
  description: string
  /** The site the preset runs on, shown as a host — never a full URL (§7.2). */
  siteLabel: string
  /**
   * The recipe's `url_pattern` — where the tool runs. The install derives the origin
   * grant from it (`originPatternOf`), because Chrome's permissions API is
   * origin-granular and a pattern may name a path.
   */
  urlPattern: string
  capabilities: readonly string[]
  definition: ToolDefinition
}

export type PresetInstallOutcome = 'installed' | 'already' | 'failed'

/**
 * The preset pack's way out (stage 3-2 Track B). `list()` is synchronous bundle data;
 * everything else is a message. The same gesture rule as the BYOK form applies: the
 * access ask fires inside the click, before any await, so `permissions.request` never
 * loses the user gesture to a round trip.
 */
export interface PresetPackPorts {
  list(): readonly PresetItem[]
  /** The tool ids already in storage, so a card can say "Added" instead of offering a double install. */
  installedIds(): Promise<readonly string[]>
  /** `false` means the user declined the origin; the install does not proceed. */
  ensureSiteAccess(urlPattern: string): Promise<boolean>
  install(definition: ToolDefinition): Promise<PresetInstallOutcome>
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

    async ensureEndpointAccess(endpoint: string): Promise<boolean> {
      const trimmed = endpoint.trim()
      if (trimmed === '') return true
      const pattern = originPatternOf(trimmed)
      // An endpoint that is not an http(s) URL is refused by the storage layer anyway;
      // there is no origin to ask for and no fetch this page could unlock.
      if (pattern === null) return true
      if (await adapter.permissions.contains([pattern])) return true
      return await adapter.permissions.request([pattern])
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

/**
 * The preset pack's ports (stage 3-2 Track B). `presets` is injected by the entrypoint —
 * the bundle is app data, not UI data. The access ask and the install are separate calls
 * so the click handler can fire the ask first, the same order the BYOK form uses.
 */
export function createPresetPackPorts(
  adapter: BrowserAdapter,
  presets: readonly PresetItem[],
): PresetPackPorts {
  return {
    list(): readonly PresetItem[] {
      return presets
    },

    async installedIds(): Promise<readonly string[]> {
      const reply = await adapter.messaging.send({ kind: 'tool:list' })
      if (reply === null || reply.kind !== 'tool:list_result') return []
      return (reply.tools ?? []).map((tool) => tool.toolId)
    },

    async ensureSiteAccess(urlPattern: string): Promise<boolean> {
      // A recipe's `url_pattern` may name a path or omit the wildcard, but Chrome's
      // permissions API is origin-granular — `permissions.request` accepts
      // `<scheme>://<host>/*` and nothing else. The grant is the origin (what the dialog
      // says); the tool only *runs* where its own pattern matches (§5.3).
      const pattern = originPatternOf(urlPattern)
      if (pattern === null) return true
      if (await adapter.permissions.contains([pattern])) return true
      return await adapter.permissions.request([pattern])
    },

    async install(definition: ToolDefinition): Promise<PresetInstallOutcome> {
      const reply = await adapter.messaging.send({ kind: 'preset:install', tool: definition })
      if (reply === null || reply.kind !== 'preset:install_result') return 'failed'
      if (reply.ok) return 'installed'
      return reply.error === 'ALREADY_INSTALLED' ? 'already' : 'failed'
    },
  }
}
