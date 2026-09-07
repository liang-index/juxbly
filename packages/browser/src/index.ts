/**
 * `@juxbly/browser` — the platform boundary.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Boundary: §6.4 (and the entrypoint assembly
 * exception §6.1/§6.4.1). Port shapes: §6.1. `BrowserAdapter`: §5.5.
 *
 * This is the **only** package that wraps `chrome.*`. Everything else depends on the
 * `BrowserAdapter` interface and receives an implementation — the chrome one in the
 * extension, the mock in tests and in the playground.
 */
export * from './chrome-adapter'
export * from './mock-adapter'
export * from './types'
