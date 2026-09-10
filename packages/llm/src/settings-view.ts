/**
 * The options page's read of the BYOK settings — `docs/ARCHITECTURE.md` §7.2
 * (`settings:manage`), stage 1-13.
 *
 * It lives here, next to the key, for one reason: **this package is the only reader of
 * `Settings.api_key` (§12.2)**, and the options page needs to know whether a key is
 * stored and which one, without ever receiving it. Turning the key into a hint is the
 * same act as reading it, so the two belong in the same file — a background handler that
 * loaded the settings and then called a helper elsewhere would put the read back in the
 * assembly layer.
 *
 * The hint is a masked tail (`…1234`) and never the value: enough to tell two keys apart
 * after a rotation, not enough to copy one out of a screenshot.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { SettingsView } from '@juxbly/core'
import { loadSettings } from '@juxbly/storage'

export type { SettingsView }

/**
 * A key shorter than this yields no hint at all. A four-character tail of an eight-
 * character secret is a meaningful fraction of the secret; local gateways happily accept
 * one-word tokens, and "which key is this" is not worth that disclosure.
 */
const MIN_HINT_LENGTH = 8
const HINT_TAIL = 4

export async function loadSettingsView(adapter: BrowserAdapter): Promise<SettingsView> {
  const settings = await loadSettings(adapter)
  const key = settings?.api_key ?? ''

  return {
    key_set: key.trim() !== '',
    key_hint: maskApiKey(key),
    api_base_url: settings?.api_base_url ?? null,
    model: settings?.model ?? null,
    // Unconfigured defaults to on — the same answer `settings:get` gives the content
    // script (stage 1-8): the ball is the product's only always-visible anchor.
    floating_ball_enabled: settings?.floating_ball_enabled !== false,
  }
}

/** `null` when the key is absent or too short to hint at. */
export function maskApiKey(key: string): string | null {
  const trimmed = key.trim()
  if (trimmed.length < MIN_HINT_LENGTH) return null
  return `…${trimmed.slice(-HINT_TAIL)}`
}
