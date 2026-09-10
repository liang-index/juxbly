/**
 * The settings patch boundary — `docs/ARCHITECTURE.md` §7.2 / §8.1, stage 1-13.
 *
 * `settings:set` is a message, and a message crosses a trust boundary: whatever arrives
 * has to be shrunk to what `Settings` actually has before it is written. That check lives
 * here, next to the type it protects and the message guards that precede it, for two
 * reasons that are the same reason:
 *
 *   1. **`packages/ui` must not depend on `packages/storage`.** The UI is bundled into the
 *      content script, and the storage package is the one that can read `juxbly:settings`
 *      — a dependency from the page context onto it would put a key reader one import away
 *      from page code. Core is already in every bundle, and here the dependency graph stays
 *      exactly as it was.
 *   2. **The credential field is named in one audited place.** The options form deals in
 *      `key` / `endpoint` / `model`; the mapping to `Settings` happens here, so no UI file
 *      ever spells `api_key` (§12.2). `packages/core/src/tool-record.ts` declares it and
 *      this file writes it, and both are on the key-leak guard's whitelist.
 *
 * Pure: no adapter, no storage, no platform access.
 */
import type { Settings } from './tool-record'

/** The only fields a `settings:set` patch may carry (§8.1). Anything else is dropped. */
const PATCHABLE_FIELDS = ['api_key', 'api_base_url', 'model', 'floating_ball_enabled'] as const

/**
 * Shrinks an incoming patch to what `Settings` actually has.
 *
 * An unknown key is **dropped rather than merged**: `Settings` is a fixed shape and a
 * caller that adds a field would be writing a value no reader will ever look at — and,
 * worse, one a later schema migration would have to reason about. Types are checked too,
 * because a `model` of `42` fails at the endpoint with an error the user cannot act on.
 */
export function sanitizeSettingsPatch(patch: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {}

  for (const field of PATCHABLE_FIELDS) {
    const value = patch[field]
    if (value === undefined) continue

    if (field === 'floating_ball_enabled') {
      if (typeof value === 'boolean') out[field] = value
      continue
    }

    // The three string fields: `null` and `''` both mean "not set", and normalising them
    // here is what keeps "configured" a single question downstream (`loadLlmEndpoint`).
    if (value === null || value === '') {
      out[field] = null
      continue
    }
    if (typeof value !== 'string') continue

    if (field === 'api_base_url') {
      // Endpoint URLs go straight into a fetch: a `javascript:` or `file:` base would be
      // a request the user never intended, so anything but http(s) is refused.
      if (!isHttpUrl(value)) continue
      out[field] = value
      continue
    }

    out[field] = value
  }

  return out as Partial<Settings>
}

/**
 * The options form's own field names. `undefined` means "leave it alone" — the form sends
 * only what the user touched, so an untouched key is never rewritten to `null`.
 */
export interface SettingsPatchInput {
  key?: string | null
  endpoint?: string | null
  model?: string | null
  floatingBall?: boolean
}

export function buildSettingsPatch(input: SettingsPatchInput): Partial<Settings> {
  return sanitizeSettingsPatch({
    ...(input.key === undefined ? {} : { api_key: input.key }),
    ...(input.endpoint === undefined ? {} : { api_base_url: input.endpoint }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.floatingBall === undefined ? {} : { floating_ball_enabled: input.floatingBall }),
  })
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
