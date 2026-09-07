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
        '@juxbly/dsl': fileURLToPath(new URL('../../packages/dsl/src/index.ts', import.meta.url)),
      },
    },
  }),
})
