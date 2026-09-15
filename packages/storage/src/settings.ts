/**
 * `juxbly:settings` — `docs/ARCHITECTURE.md` §8.1.
 *
 * No implicit defaults on purpose: if the user has never opened the settings page, there
 * are no settings, and `loadSettings()` says so by returning `null`. Filling in an
 * endpoint here would make "configured" indistinguishable from "never touched" — and the
 * BYOK endpoint choice is a user decision made in 1-13, not an engineering default.
 *
 * `api_key` travels through this module and must never travel anywhere else: not into a
 * log line, not into an error message, not into the content script (§12). The patch the
 * outside world is allowed to send is narrowed in `packages/core` — this file only decides
 * what a narrowed patch does to storage.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import { sanitizeSettingsPatch, type Settings } from '@juxbly/core'
import { SETTINGS_KEY } from './keys'

export async function loadSettings(adapter: BrowserAdapter): Promise<Settings | null> {
  return await adapter.storage.get<Settings>(SETTINGS_KEY)
}

export async function saveSettings(adapter: BrowserAdapter, settings: Settings): Promise<void> {
  await adapter.storage.set(SETTINGS_KEY, settings)
}

/**
 * Merges a patch into the stored settings and writes the result (stage 1-13).
 *
 * The whole object is replaced rather than field-by-field, so a key can be removed by
 * being patched to `null` — "replace" and "delete" are the same write, and there is no
 * second code path where a stale key could survive a rotation.
 *
 * Returns `false` when nothing survived sanitisation: writing an empty patch would look
 * like a save while changing nothing, and the panel has to say so.
 */
export async function applySettingsPatch(
  adapter: BrowserAdapter,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const next = sanitizeSettingsPatch(patch)
  if (Object.keys(next).length === 0) return false

  const current = await loadSettings(adapter)
  await saveSettings(adapter, { ...defaults(), ...current, ...next })
  return true
}

/** Written once, on the first settings write — an absent field reads as "not set". */
function defaults(): Settings {
  return { api_key: null, api_base_url: null, model: null, floating_ball_enabled: true }
}
