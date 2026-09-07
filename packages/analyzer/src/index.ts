/**
 * `@juxbly/analyzer` — what the model sees of the page, before the model is asked
 * anything.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Output contract: `PageAnalysis`, §5.5.
 * Consumed by: the build flow (§9.1, stage 1-9).
 *
 * Pure DOM reads: no writes, no scrolling, no network, no model call. The analyzer runs
 * inside a page Juxbly does not own, so "read-only" is a boundary, not a preference.
 */
export * from './analyze-page'
export * from './custom-elements'
export * from './dom'
export * from './shadow'
export * from './structure'
export * from './visible-text'
