/**
 * The playground's package entry (stage 0-2 reserved the directory; stage 1-14 filled it).
 *
 * The real entry points sit at the package root, not in `src/`:
 *
 * - `serve.mjs`  — starts the local server on demand (`pnpm --filter @juxbly/playground serve`)
 * - `server.mjs` — the server itself: fixture pages, the recorded model, the harness API
 * - `e2e/`       — the lifecycle script (`pnpm test:e2e`)
 *
 * They run as plain Node ESM, the way `scripts/sync-public.mjs` already does, so nothing here
 * needs a build step or a bundler. `src/` holds no runtime code; it exists because this
 * package's `tsconfig.json` points at it.
 */
export const appId = '@juxbly/playground' as const
