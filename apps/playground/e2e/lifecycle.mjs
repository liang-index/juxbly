/**
 * The lifecycle harness — `task/stage-1-14.md` Scope 1 / Acceptance Criteria 1–2.
 *
 * It walks one tool through every ring of `docs/concepts/tool-lifecycle.md` against a real
 * unpacked extension in a real browser, driving only what a person can drive: clicks,
 * typing, page loads. Nothing in this directory stubs the extension, patches storage
 * mid-flow, or calls an internal message — a ring reached by shortcut is a ring not proven.
 *
 * What *is* controlled from outside, and why that is legitimate:
 *
 * - the **model** is a recording on loopback, so the run is repeatable and free;
 * - the **page** can be redesigned by the server, which is how the health and repair rings
 *   are reached — and that is precisely what a real site does to a saved tool.
 *
 * Everything the script asserts about *state* it reads back from `chrome.storage`, which is
 * what the UI drew from; every assertion about *spend* it takes from the recording's own
 * counters, never from the panel.
 *
 * Usage: `pnpm test:e2e` (builds the extension first, then runs this file).
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clearStorage, launchWithExtension, writeRecordedEndpoint } from './browser.mjs'
import { dumpDiagnostics } from './diagnostics.mjs'
import { createHarness } from './harness.mjs'
import { loadPlaywright } from './playwright.mjs'
import { createReport } from './report.mjs'
import { ringBuild, ringDiscover, ringRun, ringSave } from './rings-build.mjs'
import { ringHealth, ringRepair, ringRollback } from './rings-health.mjs'
import { ringSurfaces } from './surfaces.mjs'

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const EXTENSION_PATH = join(REPO_ROOT, '.output', 'chrome-mv3')
const TOOL_ID = 'tool_lifecycle'

async function main() {
  if (!existsSync(join(EXTENSION_PATH, 'manifest.json'))) {
    throw new Error(
      [
        'No unpacked extension found at .output/chrome-mv3.',
        'Run `pnpm build` first — the harness loads exactly what a contributor loads.',
      ].join('\n'),
    )
  }

  const { chromium } = await loadPlaywright()
  const { startPlaygroundServer } = await import('../server.mjs')

  const server = await startPlaygroundServer()
  const report = createReport()
  const harness = createHarness(server.origin)
  const pageUrl = `${server.origin}/lifecycle.html`

  console.log('Juxbly lifecycle — opened ended-to-end against .output/chrome-mv3')
  console.log(`         playwright ${chromium.name()} · recorded model at ${server.origin}/v1`)

  const browser_ = await launchWithExtension({ chromium, extensionPath: EXTENSION_PATH })
  const context = browser_.context

  try {
    await clearStorage({ worker: browser_.worker })
    await writeRecordedEndpoint({ worker: browser_.worker, baseUrl: `${server.origin}/v1` })
    await harness.reset()

    const page = await context.newPage()
    const logs = []
    page.on('pageerror', (error) => logs.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') logs.push(message.text())
    })

    const ctx = {
      page,
      context,
      worker: browser_.worker,
      extensionId: browser_.extensionId,
      harness,
      toolId: TOOL_ID,
      pageUrl,
      logs,
    }

    try {
      await ringDiscover(ctx, report)
      await ringBuild(ctx, report)
      await ringSave(ctx, report)
      await ringRun(ctx, report)
      await ringHealth(ctx, report)
      await ringRepair(ctx, report)
      await ringRollback(ctx, report)
      await ringSurfaces(ctx, report)
    } catch (error) {
      // A ring that could not finish is a failure, and the next ring would be asserting
      // against a state nobody intended — so the run stops here, loudly.
      report.check('the lifecycle ran to the end', false, describe(error))
      await dumpDiagnostics(ctx)
    }
  } finally {
    await browser_.close()
    await server.close()
  }

  return report.summary()
}

main()
  .then((failed) => {
    process.exitCode = failed === 0 ? 0 : 1
  })
  .catch((error) => {
    console.error('\nLifecycle harness failed:')
    console.error(describe(error))
    process.exitCode = 1
  })

function describe(error) {
  const message = error instanceof Error ? error.message : String(error)
  // Playwright puts the useful part (which locator, which wait) on the first line.
  return message.split('\n').slice(0, 3).join(' ')
}
