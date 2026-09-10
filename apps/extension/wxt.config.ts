import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'
import { JUXBLY_MANIFEST } from './manifest'

/**
 * WXT configuration for the Chrome MV3 extension (stage 0-3).
 *
 * `outDir` points at the repository root on purpose: `README.md` and
 * `docs/DEVELOPMENT.md` both tell contributors to load `.output/chrome-mv3`, and
 * contributors run `pnpm dev` from the root. Sending the output to
 * `apps/extension/.output` would make those instructions wrong.
 *
 * The `@juxbly/*` aliases resolve workspace packages to their `src/` entry — these
 * packages publish source, not build output, and without an explicit alias the bundle
 * would follow the symlink out of the Vite root. Register a package here when the
 * extension first imports it.
 *
 * Order matters: `@juxbly/ui/copy` must precede `@juxbly/ui`, otherwise the shorter
 * key swallows the subpath import.
 */
export default defineConfig({
  // WXT resolves module packages by name (`UserConfig.modules` is `string[]`).
  // This one registers the React plugin and JSX handling for every entrypoint.
  modules: ['@wxt-dev/module-react'],

  outDir: fileURLToPath(new URL('../../.output', import.meta.url)),

  manifest: JUXBLY_MANIFEST,

  vite: () => ({
    resolve: {
      alias: {
        '@juxbly/ui/copy': fileURLToPath(
          new URL('../../packages/ui/src/copy/index.ts', import.meta.url),
        ),
        '@juxbly/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
        '@juxbly/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
        // Stage 1-6: the background entrypoint now reaches the llm package, which reads
        // settings through storage and the platform through the browser adapter.
        '@juxbly/llm': fileURLToPath(new URL('../../packages/llm/src/index.ts', import.meta.url)),
        '@juxbly/storage': fileURLToPath(
          new URL('../../packages/storage/src/index.ts', import.meta.url),
        ),
        '@juxbly/browser': fileURLToPath(
          new URL('../../packages/browser/src/index.ts', import.meta.url),
        ),
        // Stage 1-12: reached from `storage` (the repair write path), which the background
        // already imports — `repair` itself stays pure, so no runtime dependency moves with
        // it beyond `core` types.
        '@juxbly/repair': fileURLToPath(
          new URL('../../packages/repair/src/index.ts', import.meta.url),
        ),
        // Stage 1-11 imported this in `background.ts` without registering it: typecheck and
        // tests resolve through tsconfig paths / vitest, so only `wxt build` noticed. Added
        // here with 1-12 because the same rule applies — register on first import.
        '@juxbly/health': fileURLToPath(
          new URL('../../packages/health/src/index.ts', import.meta.url),
        ),
        '@juxbly/dsl': fileURLToPath(new URL('../../packages/dsl/src/index.ts', import.meta.url)),
        // Stage 1-9: the content script analyses the page, scores the model's candidates
        // with a dry run of `extract`, and queries the DOM through the same helper the
        // capability uses.
        '@juxbly/analyzer': fileURLToPath(
          new URL('../../packages/analyzer/src/index.ts', import.meta.url),
        ),
        // Stage 1-15: the serialisers the run panel's export buttons and the export
        // capability share. Must precede `@juxbly/capabilities` so the shorter key does not
        // swallow it, and it pulls no `ui` dependency — which is what keeps the shared
        // serialisation from creating a ui↔capabilities cycle.
        '@juxbly/capabilities/export': fileURLToPath(
          new URL('../../packages/capabilities/src/export/index.ts', import.meta.url),
        ),
        '@juxbly/capabilities': fileURLToPath(
          new URL('../../packages/capabilities/src/index.ts', import.meta.url),
        ),
        // Stage 1-10: the content script runs saved tools with the 1-7 engine.
        '@juxbly/runtime': fileURLToPath(
          new URL('../../packages/runtime/src/index.ts', import.meta.url),
        ),
      },
    },
  }),
})
