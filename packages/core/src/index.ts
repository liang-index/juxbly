/**
 * `@juxbly/core` — domain models, runtime contracts and the cross-context message
 * protocol.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Message protocol: §7.2. Storage contract: §8.1.
 * Runtime contracts: §5.5 (the single authoritative place for those shapes).
 *
 * Pure types plus two kinds of shared code that must sit next to them: the logger, and
 * the message-boundary guards / patch shapers (`messages.ts`, `settings.ts`) — functions
 * that run on both sides of the messaging boundary and must therefore be in every
 * bundle, the content script's included. No side effects, no platform access, no runtime
 * dependencies. References to DSL types are `import type` only and erase at compile
 * time — see tool-record.ts / runtime.ts / messages.ts.
 */
export * from './capability'
export * from './logger'
export * from './messages'
export * from './runtime'
export * from './settings'
export * from './tool-record'
