/**
 * `@juxbly/extension` is a WXT app: its real entry points live in `entrypoints/`
 * (see `wxt.config.ts`), not here. This module remains the package barrel — the file
 * the package name and `pnpm typecheck` resolve to — but WXT does not build it.
 *
 * apps/playground hosts the benchmark runner in stage 2-3.
 */
export const appId = '@juxbly/extension' as const
