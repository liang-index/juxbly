/**
 * `@juxbly/storage` — the local storage wrapper and data migrations.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Storage contract: §8.1.
 *
 * Every function takes a `BrowserAdapter` instead of reaching for the platform: the whole
 * package then runs unchanged in tests, in the background service worker and in the
 * playground. It never touches platform storage on its own — only through
 * `packages/browser` (§6.4).
 */
export * from './keys'
export * from './migrations'
export * from './onboarding'
export * from './settings'
export * from './tools'
export * from './build-save'
