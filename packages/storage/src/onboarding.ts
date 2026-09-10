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
 * Sets one or more milestones (stage 1-13).
 *
 * **Merge-only**: a flag already `true` stays `true`. Each flag means "the user was shown
 * this once", which is a fact about the past — nothing in the product has a reason to
 * rewind it, and a second build must not get to replay the first-build notice.
 *
 * The four are written independently and never as a progress value: any node may fire
 * first (a user can configure a key in the options page before they ever open the panel),
 * so a caller sets its own bit and leaves the others to their own writers.
 *
 * Returns the merged flags, so the caller renders from the same record it will read next
 * time instead of from its own patch.
 */
export async function setOnboardingFlags(
  adapter: BrowserAdapter,
  patch: Partial<OnboardingFlags>,
): Promise<OnboardingFlags> {
  const flags = await loadOnboardingFlags(adapter)
  const merged: OnboardingFlags = {
    first_install_glow_shown: flags?.first_install_glow_shown === true || patch.first_install_glow_shown === true,
    first_chat_opened: flags?.first_chat_opened === true || patch.first_chat_opened === true,
    api_key_requested: flags?.api_key_requested === true || patch.api_key_requested === true,
    first_tool_built: flags?.first_tool_built === true || patch.first_tool_built === true,
  }

  await saveOnboardingFlags(adapter, merged)
  return merged
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

  // The merge fills the other three with "not yet", which is the honest answer at that
  // moment; each has its own writer that merges the same way.
  await setOnboardingFlags(adapter, { first_tool_built: true })
  return true
}
