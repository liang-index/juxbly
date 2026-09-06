/**
 * `@juxbly/core` — domain models, runtime contracts and the cross-context message
 * protocol.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Message protocol: §7.2. Storage contract: §8.1.
 * Runtime contracts: §5.5 (the single authoritative place for those shapes).
 *
 * Pure types plus the logger: no side effects, no platform access, no runtime
 * dependencies. References to DSL types are `import type` only and erase at compile
 * time — see tool-record.ts / runtime.ts / messages.ts.
 */
export * from './logger'
export * from './messages'
export * from './runtime'
export * from './tool-record'
