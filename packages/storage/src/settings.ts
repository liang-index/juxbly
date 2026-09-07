/**
 * `juxbly:settings` — `docs/ARCHITECTURE.md` §8.1.
 *
 * No implicit defaults on purpose: if the user has never opened the settings page, there
 * are no settings, and `loadSettings()` says so by returning `null`. Filling in an
 * endpoint here would make "configured" indistinguishable from "never touched" — and the
 * BYOK endpoint choice is a user decision made in 1-13, not an engineering default.
 *
 * `api_key` travels through this module and must never travel anywhere else: not into a
 * log line, not into an error message, not into the content script (§12).
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { Settings } from '@juxbly/core'
import { SETTINGS_KEY } from './keys'

export async function loadSettings(adapter: BrowserAdapter): Promise<Settings | null> {
  return await adapter.storage.get<Settings>(SETTINGS_KEY)
}

export async function saveSettings(adapter: BrowserAdapter, settings: Settings): Promise<void> {
  await adapter.storage.set(SETTINGS_KEY, settings)
}
