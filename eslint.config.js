import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Two rules in this file enforce architecture invariants, not style preferences:
 *
 * 1. `no-eval` / `no-implied-eval` / `no-new-func` — the repository must never
 *    contain dynamic code execution. LLM output is configuration, never code
 *    (`docs/ARCHITECTURE.md` §1 principle 1).
 * 2. `chrome` global + chrome-flavoured imports — `packages/browser` is the only
 *    package allowed to touch `chrome.*` (`docs/ARCHITECTURE.md` §6.4).
 *
 * If either rule stops firing, the corresponding invariant in ARCHITECTURE.md is
 * no longer enforced anywhere. Do not disable them; fix the offending code.
 */
export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.output/**', '**/.wxt/**', 'LICENSE'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'chrome',
          message:
            'chrome.* is only allowed in packages/browser (ARCHITECTURE.md §6.4). Depend on the BrowserAdapter interface instead.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['chrome-*', '*chrome*'],
              message:
                'Importing chrome internals is only allowed in packages/browser (ARCHITECTURE.md §6.4).',
            },
          ],
        },
      ],
    },
  },
  {
    // The single sanctioned exception: packages/browser is the chrome.* boundary.
    files: ['packages/browser/**'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    /**
     * The background entrypoint is the assembly-layer exception of
     * `docs/ARCHITECTURE.md` §6.4.1: it may register platform listeners, but it is an
     * MV3 service worker, so it has no DOM and no window. Failing here is what keeps
     * "the worker is recycled, keep no state" from being a comment nobody enforces.
     */
    files: ['apps/extension/entrypoints/background.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message:
            'MV3 service worker: there is no window, and the worker is recycled without warning. Read state from storage instead.',
        },
        {
          name: 'document',
          message:
            'MV3 service worker: there is no DOM. Platform work goes through packages/browser.',
        },
      ],
      'no-restricted-imports': 'off',
    },
  },
)
