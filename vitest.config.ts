import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Package names must stay in sync with `docs/ARCHITECTURE.md` §4 (module map).
 * Each package resolves to its `src/` so tests import via `@juxbly/<pkg>` the same
 * way runtime code does — a second resolution strategy here would drift.
 */
const PACKAGES = [
  'core',
  'dsl',
  'runtime',
  'capabilities',
  'browser',
  'analyzer',
  'health',
  'repair',
  'ui',
  'storage',
  'llm',
] as const

/**
 * Anchored regexes, not string keys: a bare `@juxbly/ui` key would also swallow
 * `@juxbly/ui/copy` and resolve it to a path that does not exist.
 */
const SUBPATH_ALIASES = [
  {
    find: /^@juxbly\/ui\/copy$/,
    replacement: fileURLToPath(new URL('./packages/ui/src/copy', import.meta.url)),
  },
  // 1-15: shared export serialisers, no `ui` dependency — importing this subpath never
  // creates a ui↔capabilities cycle.
  {
    find: /^@juxbly\/capabilities\/export$/,
    replacement: fileURLToPath(new URL('./packages/capabilities/src/export', import.meta.url)),
  },
]

const PACKAGE_ALIASES = PACKAGES.map((name) => ({
  find: new RegExp(`^@juxbly/${name}$`),
  replacement: fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url)),
}))

const alias = [...SUBPATH_ALIASES, ...PACKAGE_ALIASES]

export default defineConfig({
  /**
   * The aliases also sit at the top level, not only on the projects below: `scripts/bench.mjs`
   * loads the benchmark runner through Vite's SSR pipeline, and a top-level `resolve.alias`
   * is what it picks up. Projects keep their own copy so a project-level change cannot
   * change the CLI's resolution — both come from the same `alias` array either way.
   */
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
            'tests/benchmark/**/*.test.ts',
            'packages/*/src/**/*.test.ts',
          ],
          // The benchmark's own tests need a DOM: they parse corpus snapshots.
          exclude: ['tests/benchmark/**/*.bench.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['packages/ui/**/*.test.ts', 'packages/ui/**/*.test.tsx'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'bench',
          environment: 'jsdom',
          include: ['tests/benchmark/**/*.bench.test.ts'],
          // Parsing a snapshot is not fast, and a slow machine must not turn a
          // passing suite red: only a real hang should fail these.
          testTimeout: 60_000,
        },
      },
    ],
  },
})
