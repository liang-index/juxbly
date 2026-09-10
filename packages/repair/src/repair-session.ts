/**
 * The repair session — `docs/ARCHITECTURE.md` §5.5 / §9.3, `task/stage-1-12.md`.
 *
 * The shape lives in `packages/core` (§5.5: core is the type SSOT); what this module adds
 * is the lifecycle around it:
 *
 * - **Two triggers, one path.** A broken tool opens with a preset context message; a
 *   user-initiated rework opens with none. The rest — analyse, propose, highlight, confirm,
 *   new version — is identical, which is the point: a repair is not a special mode, it is
 *   the build flow with the first turn already written.
 * - **Stop-loss at two attempts.** A repair that failed twice stops asking and says what
 *   the user can do instead (the A4 level ④ advice, rendered by the build panel).
 * - **A cancellation is not a failure.** The user closing the panel, or abandoning a
 *   confirmation, counts for nothing — counting it would stop them on their *second*
 *   attempt at something they never actually attempted.
 *
 * Everything here is pure. There is no auto-repair path in this file and there must never
 * be one: V1 repairs only ever happen after a user confirms a highlighted plan
 * (`docs/CONVENTIONS.md` §15).
 */
import type { RepairSession } from '@juxbly/core'
import {
  buildContextMessage,
  type HealthReason,
  type RepairContextCopy,
} from './context-message'

/** Attempts a repair gets before it stops retrying on its own (product baseline §6.3). */
export const REPAIR_MAX_ATTEMPTS = 2

/** What a session needs from the tool: the id it writes to and the version it replaces. */
export interface RepairTarget {
  toolId: string
  /** The version currently in effect — the one a successful repair replaces. */
  version: number
}

/** A breakage-triggered repair: the context message is written for the user (§9.3). */
export function fromHealth(
  target: RepairTarget,
  source: HealthReason,
  copy: RepairContextCopy,
): RepairSession {
  return {
    toolId: target.toolId,
    trigger: 'broken',
    presetPrompt: buildContextMessage(source, copy),
    attempt: 0,
    baseVersion: target.version,
  }
}

/**
 * A user-initiated rework: same flow, no "I detected a problem" claim.
 *
 * The empty preset is the *only* difference, and it is deliberate: the tool may be working
 * perfectly — the user may just want different fields. Claiming a breakage there would be
 * an assertion the product has no evidence for.
 */
export function fromUserEdit(target: RepairTarget): RepairSession {
  return {
    toolId: target.toolId,
    trigger: 'user',
    presetPrompt: '',
    attempt: 0,
    baseVersion: target.version,
  }
}

export function getPrefilledMessage(session: RepairSession): string {
  return session.presetPrompt
}

/**
 * A turn that ended in failure. The *count* is what stops the flow, never the failure
 * itself — one failure is information, two is a pattern.
 *
 * There is deliberately no `noteCancelled` counterpart: nothing would call it, because a
 * cancellation is honoured by *not counting it* — the panel never reaches here when the
 * user closes the flow. A rule no code can break does not need an entry point, and an
 * entry point would only invite a caller that counts a cancellation by mistake.
 */
export function recordFailure(session: RepairSession): RepairSession {
  return { ...session, attempt: session.attempt + 1 }
}

export function shouldStop(session: RepairSession): boolean {
  return session.attempt >= REPAIR_MAX_ATTEMPTS
}
