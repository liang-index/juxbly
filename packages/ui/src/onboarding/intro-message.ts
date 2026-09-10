/**
 * Node ② — the opening line (`task/stage-1-13.md` Scope 1).
 *
 * One extra sentence the first time the conversation opens, and never again. It is a
 * sentence inside the panel, not a tour of it: the product's whole onboarding budget is
 * four moments, and this one buys "I can see this page" plus "I will ask if I am unsure" —
 * the two facts that make the next message writable.
 *
 * The node fires when the panel *opens*, not when it is constructed: a panel built and
 * collapsed without ever being shown has told the user nothing, and marking the milestone
 * there would spend the sentence on nobody.
 */
import type { OnboardingFlags } from '@juxbly/core'
import type { CopyKey } from '../copy'
import { shouldFire } from './flags'

export const INTRO_COPY_KEY: CopyKey = 'onboarding.intro.line'

/** `null` means "say nothing extra" — the recurring hint stands on its own. */
export function introLine(flags: OnboardingFlags | null): CopyKey | null {
  return shouldFire(flags, 'intro') ? INTRO_COPY_KEY : null
}
