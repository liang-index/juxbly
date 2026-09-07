/**
 * `@juxbly/capabilities` — the five capability executors.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Capability contract: §6.1; permissions: §6.3.
 *
 * Stage 1-4 lands `transform` and `render`; `extract` (1-5), `llm` (1-6) and `export`
 * (1-15) register the same way through `CapabilityRegistry`.
 *
 * No capability reaches a platform API on its own: everything goes through the ports in
 * `ExecutionContext` (`docs/ARCHITECTURE.md` §6.4).
 */
export * from './errors'
export * from './extract'
export * from './render'
export * from './transform'
