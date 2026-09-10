/**
 * The four one-shot nodes — `docs/ARCHITECTURE.md` §8.1, `task/stage-1-13.md` Scope 1.
 *
 * Four booleans, one writer each, **and no ordering between them**. They are milestones
 * ("the user was shown this once"), never a progress bar: a user can paste a key in the
 * options page before they ever open the panel, and a user can build a tool they were
 * never asked for a key about on a page that needs no model call. Any attempt to read a
 * sequence out of them — "step 3 of 4" — would be a lie about what happened.
 *
 * A `null` flags record means "storage was never written", which is the honest answer
 * before the first visit, and it is treated as "no node has fired yet" for all four.
 *
 * Pure and DOM-free: the trigger conditions are the part that has to be tested, and a
 * test that had to mount a panel to check "does the glow play twice" would not be written.
 */
import type { OnboardingFlags } from '@juxbly/core'

export type OnboardingNode = 'glow' | 'intro' | 'key' | 'first-build'

/**
 * Node ④'s writer is stage 1-10 (a successful run), not this package: "the user has seen
 * a tool work" is something only the run can prove. Every other node writes its own bit
 * the moment it fires.
 */
export const NODE_OWNER: Readonly<Record<OnboardingNode, 'stage-1-13' | 'stage-1-10'>> = {
  glow: 'stage-1-13',
  intro: 'stage-1-13',
  key: 'stage-1-13',
  'first-build': 'stage-1-10',
}

/** A flag is `true` only when storage says so; absent storage means nothing has fired. */
export function hasFired(flags: OnboardingFlags | null, node: OnboardingNode): boolean {
  return flags?.[FLAG_OF[node]] === true
}

/**
 * Whether a node still owes the user its one appearance.
 *
 * Nodes ①②④ are pure "has it fired" questions. Node ③ adds one condition, and it is the
 * whole point of the node: with a key already configured there is nothing to ask for, so
 * the milestone is "the user was *asked*", not "the user went through a key screen" — the
 * two differ for anyone who set their key up in the options page first.
 */
export function shouldFire(
  flags: OnboardingFlags | null,
  node: OnboardingNode,
  context: { keySet?: boolean } = {},
): boolean {
  if (hasFired(flags, node)) return false
  if (node === 'key' && context.keySet === true) return false
  return true
}

/** The patch a node sends when it fires — its own bit and nothing else. */
export function patchFor(node: OnboardingNode): Partial<OnboardingFlags> {
  return { [FLAG_OF[node]]: true } as Partial<OnboardingFlags>
}

const FLAG_OF: Readonly<Record<OnboardingNode, keyof OnboardingFlags>> = {
  glow: 'first_install_glow_shown',
  intro: 'first_chat_opened',
  key: 'api_key_requested',
  'first-build': 'first_tool_built',
}

export { FLAG_OF }
