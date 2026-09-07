/**
 * The three storage keys — `docs/ARCHITECTURE.md` §8.1, verbatim.
 *
 * One place defines them because a key typo is invisible: `get` returns `null` and the
 * caller cannot tell "no data yet" from "wrong key".
 */
export const TOOLS_KEY = 'juxbly:tools'
export const SETTINGS_KEY = 'juxbly:settings'
export const ONBOARDING_KEY = 'juxbly:onboarding'

export type StorageKey = typeof TOOLS_KEY | typeof SETTINGS_KEY | typeof ONBOARDING_KEY

/** Every key §8.1 defines — the migration and "wipe" paths both need the full set. */
export const STORAGE_KEYS: readonly StorageKey[] = [TOOLS_KEY, SETTINGS_KEY, ONBOARDING_KEY]
