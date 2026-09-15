/**
 * Finding Playwright, without pretending it is always there.
 *
 * Playwright is a **development-only, heavyweight** dependency: the package itself pulls a
 * browser build (hundreds of megabytes) per machine. It is deliberately not declared in
 * this repository yet, so nothing in `pnpm install` or `pnpm test` downloads a browser for
 * someone who only wanted to run the unit suite.
 *
 * Two ways to satisfy it, in order:
 *
 * 1. `pnpm add -D -w playwright && pnpm exec playwright install chromium`
 * 2. `JUXBLY_PLAYWRIGHT_HOME=/path/to/a/node_modules/parent` — for a machine (or a CI
 *    image) that already keeps Playwright somewhere else. The harness never installs
 *    anything itself: a test runner that mutates the environment is a test runner nobody
 *    can reproduce.
 *
 * The failure message names the command rather than printing a module resolution trace —
 * the only useful thing at that point is what to type.
 */
export async function loadPlaywright() {
  const home = process.env.JUXBLY_PLAYWRIGHT_HOME

  if (home !== undefined && home !== '') {
    const { createRequire } = await import('node:module')
    const { join } = await import('node:path')
    const require_ = createRequire(join(home, 'index.cjs'))
    return require_('playwright')
  }

  try {
    return await import('playwright')
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    throw new Error(
      [
        'The lifecycle harness drives a real browser, and Playwright is not installed.',
        '',
        '  pnpm add -D -w playwright',
        '  pnpm exec playwright install chromium',
        '',
        'Or point it at an existing installation: JUXBLY_PLAYWRIGHT_HOME=<dir with node_modules>',
      ].join('\n'),
    )
  }
}
