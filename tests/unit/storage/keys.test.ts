import { describe, expect, it } from 'vitest'
import { ONBOARDING_KEY, SETTINGS_KEY, STORAGE_KEYS, TOOLS_KEY } from '@juxbly/storage'

/**
 * `docs/ARCHITECTURE.md` §8.1, verbatim.
 *
 * A key is not a name, it is on-disk data: renaming one orphans every tool the user ever
 * saved, and nothing else in the codebase would notice.
 */
describe('storage keys (ARCHITECTURE.md §8.1)', () => {
  it('names the three keys exactly as §8.1 does', () => {
    expect(TOOLS_KEY).toBe('juxbly:tools')
    expect(SETTINGS_KEY).toBe('juxbly:settings')
    expect(ONBOARDING_KEY).toBe('juxbly:onboarding')
  })

  it('lists all three, so a migration or an audit cannot forget one', () => {
    expect(STORAGE_KEYS).toEqual(['juxbly:tools', 'juxbly:settings', 'juxbly:onboarding'])
  })
})
