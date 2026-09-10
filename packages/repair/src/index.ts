/**
 * `@juxbly/repair` — repair sessions, version creation and rollback
 * (`docs/ARCHITECTURE.md` §4 / §8.1 / §9.3; `task/stage-1-12.md`).
 *
 * This package **decides and transforms; it never writes and never repairs by itself**.
 * Storage belongs to the background (§7.1) and the confirmation belongs to the user (§9.1),
 * so every export here is a pure function over a `ToolRecord`. That is what keeps the
 * product invariant testable: there is no code path in this package that could quietly
 * change a saved tool.
 *
 * V1 has no silent auto-repair, no auto-generated repair candidate and no auto-apply.
 * A repair is: detect → explain → (user) re-describe → highlight → confirm → new version.
 */
export {
  buildContextMessage,
  type HealthReason,
  type RepairContextCopy,
} from './context-message'
export {
  commitRepair,
  nextVersionOf,
  type CommitRepairInput,
  type FreshVersionState,
  type RepairOrigin,
} from './create-version'
export { rollbackTo, type RollbackInput } from './rollback'
export {
  REPAIR_MAX_ATTEMPTS,
  fromHealth,
  fromUserEdit,
  getPrefilledMessage,
  recordFailure,
  shouldStop,
  type RepairTarget,
} from './repair-session'
