import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { OnboardingFlags } from '@juxbly/core'
import { loadOnboardingFlags, markFirstToolBuilt, saveOnboardingFlags } from '@juxbly/storage'

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

/**
 * `first_tool_built` is written by stage 1-10 — the moment a tool enters run mode, which
 * is what "the user has seen one work" means (§3.5.4). 1-13 only reads it.
 */
describe('markFirstToolBuilt', () => {
  it('is set the first time a tool runs', async () => {
    const adapter = createMockAdapter()

    await expect(markFirstToolBuilt(adapter)).resolves.toBe(true)

    await expect(loadOnboardingFlags(adapter)).resolves.toEqual({
      first_install_glow_shown: false,
      first_chat_opened: false,
      api_key_requested: false,
      first_tool_built: true,
    })
  })

  it('is not written twice: a second build does not touch storage', async () => {
    const adapter = createMockAdapter()
    await markFirstToolBuilt(adapter)

    const writesBefore = adapter.calls.filter((call) => call.method === 'storage.set').length
    await expect(markFirstToolBuilt(adapter)).resolves.toBe(false)

    expect(adapter.calls.filter((call) => call.method === 'storage.set')).toHaveLength(writesBefore)
  })

  it('keeps the milestones other stages have already set', async () => {
    const adapter = createMockAdapter()
    await saveOnboardingFlags(adapter, { ...FLAGS, first_chat_opened: true, api_key_requested: true })

    await markFirstToolBuilt(adapter)

    await expect(loadOnboardingFlags(adapter)).resolves.toEqual({
      first_install_glow_shown: true,
      first_chat_opened: true,
      api_key_requested: true,
      first_tool_built: true,
    })
  })
})
