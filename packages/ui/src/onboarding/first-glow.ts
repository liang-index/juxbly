/**
 * Node ① — the first-install glow (`task/stage-1-13.md` Scope 1).
 *
 * A breath, once, on the first page after install: the ball is otherwise nearly invisible
 * (opacity 0.32 at rest), so a new user has no reason to look at it. It is deliberately
 * **not** a tooltip, a bubble or a callout — the product does not do overlays, and a
 * first-run explanation would be a Welcome Wizard by another name.
 *
 * It shares nothing with stage 1-8's `jx-once-pulse`. That pulse means "this page has
 * saved tools"; this one means "you just installed this". Different trigger, different
 * motion, different class, and a different flag — the first-use design note in
 * `V0 docs/` forbids merging the two outright. The pulse is a ring that diffuses outward; the glow is the
 * ball itself brightening and settling, slower and with no ring.
 *
 * Constants live here rather than only in CSS because the mount has to know when to take
 * the class off: a class that outlives its animation can retrigger on any later re-render.
 */
import type { OnboardingFlags } from '@juxbly/core'
import { shouldFire } from './flags'

/** Distinct from `is-pulsing` on purpose — two triggers, two motions, two classes. */
export const INSTALL_GLOW_CLASS = 'jx-install-glow'

/** Slightly longer than the has-tools pulse (900 ms): nothing else is competing for attention. */
export const INSTALL_GLOW_MS = 1400

export interface InstallGlow {
  /** Whether to add the class at mount. */
  play: boolean
  /** How long to keep it — the fallback for environments where `animationend` never fires. */
  durationMs: number
}

export function installGlow(flags: OnboardingFlags | null): InstallGlow {
  return { play: shouldFire(flags, 'glow'), durationMs: INSTALL_GLOW_MS }
}
