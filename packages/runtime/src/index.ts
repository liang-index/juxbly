/**
 * `@juxbly/runtime` — step orchestration, the variable bag, the llm-cache decision and
 * the capability registry.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Registry contract: §6.2. Run flow: §9.2.
 *
 * The engine dispatches on a step type and never imports a capability: what it knows
 * comes from the registry, and what it can reach comes from the ports it was constructed
 * with. That is why `packages/runtime` depends on `core` and `dsl` and on nothing else.
 */
export * from './registry'
export * from './hash'
export * from './variable-bag'
export * from './ports'
export * from './summary'
export * from './tool-runtime'
