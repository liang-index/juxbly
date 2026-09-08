/**
 * `juxbly:onboarding` — `docs/ARCHITECTURE.md` §8.1, the four one-shot milestones.
 *
 * Same rule as settings: no implicit defaults. "No flags" is the honest answer before the
 * first install, and every flag is one-shot, so inventing `false` values here would make
 * it impossible to tell "milestone not reached" from "storage never written".
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { OnboardingFlags } from '@juxbly/core'
import { ONBOARDING_KEY } from './keys'

export async function loadOnboardingFlags(
  adapter: BrowserAdapter,
): Promise<OnboardingFlags | null> {
  return await adapter.storage.get<OnboardingFlags>(ONBOARDING_KEY)
}

export async function saveOnboardingFlags(
  adapter: BrowserAdapter,
  flags: OnboardingFlags,
): Promise<void> {
  await adapter.storage.set(ONBOARDING_KEY, flags)
}

/**
 * Sets `first_tool_built` once. Written by stage 1-10 (the run panel), not by 1-13 —
 * the flag means "this user has seen a tool work", which is exactly what entering run
 * mode proves, and 1-13 only *reads* it to decide whether the notice has fired.
 *
 * Returns whether a write happened: an already-set flag is not rewritten, so a second
 * successful build does not touch storage.
 *
 * When no flags exist yet, the other three are written as `false` — the record has to be
 * complete (`OnboardingFlags` has no optional fields), and at that moment "not yet" is
 * the honest answer for all three; each has its own writer that merges the same way.
 */
export async function markFirstToolBuilt(adapter: BrowserAdapter): Promise<boolean> {
  const flags = await loadOnboardingFlags(adapter)
  if (flags?.first_tool_built === true) return false

  await saveOnboardingFlags(adapter, {
    first_install_glow_shown: flags?.first_install_glow_shown ?? false,
    first_chat_opened: flags?.first_chat_opened ?? false,
    api_key_requested: flags?.api_key_requested ?? false,
    first_tool_built: true,
  })
  return true
}
