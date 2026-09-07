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
