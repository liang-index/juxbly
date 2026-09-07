/**
 * `@juxbly/capabilities` — the five capability executors.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Capability contract: §6.1; permissions: §6.3.
 *
 * Stage 1-4 lands `transform` and `render`, 1-5 lands `extract` and 1-7 lands `llm`;
 * `export` (1-15) registers the same way through `CapabilityRegistry`, at the point 1-7
 * leaves open for it.
 *
 * No capability reaches a platform API on its own: everything goes through the ports in
 * `ExecutionContext` (`docs/ARCHITECTURE.md` §6.4).
 */
export * from './errors'
export * from './extract'
export * from './llm'
export * from './render'
export * from './transform'
