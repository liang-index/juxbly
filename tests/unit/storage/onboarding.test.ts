import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { OnboardingFlags } from '@juxbly/core'
import { loadOnboardingFlags, saveOnboardingFlags } from '@juxbly/storage'

/**
 * `juxbly:onboarding` — `docs/ARCHITECTURE.md` §8.1, four one-shot milestones.
 */
const FLAGS: OnboardingFlags = {
  first_install_glow_shown: true,
  first_chat_opened: true,
  api_key_requested: false,
  first_tool_built: false,
}

describe('onboarding flags', () => {
  it('returns null before the first milestone is recorded', async () => {
    await expect(loadOnboardingFlags(createMockAdapter())).resolves.toBeNull()
  })

  it('round-trips the four flags', async () => {
    const adapter = createMockAdapter()
    await saveOnboardingFlags(adapter, FLAGS)

    await expect(loadOnboardingFlags(adapter)).resolves.toEqual(FLAGS)
  })
})
