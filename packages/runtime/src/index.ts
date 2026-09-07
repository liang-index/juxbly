/**
 * `@juxbly/runtime` — step orchestration, the variable bag and the capability registry.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Registry contract: §6.2.
 *
 * Stage 1-4 lands the registry (the seam capabilities plug into); the orchestration that
 * resolves `input_from` into records and calls `execute` belongs to 1-7.
 */
export * from './registry'
