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
]

const PACKAGE_ALIASES = PACKAGES.map((name) => ({
  find: new RegExp(`^@juxbly/${name}$`),
  replacement: fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url)),
}))

const alias = [...SUBPATH_ALIASES, ...PACKAGE_ALIASES]

export default defineConfig({
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
            'packages/*/src/**/*.test.ts',
          ],
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
    ],
  },
})
