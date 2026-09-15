/**
 * Rings 5–7: health → repair → rollback. The reason this stage exists.
 *
 * Earlier stages each proved one ring works. What has never been run end to end is the
 * claim the whole product rests on: **a page changes, the tool notices, and the user can
 * move forward without starting over.** So this file does not stage anything gently — it
 * redesigns the page under the tool and then asks whether anything downstream still holds.
 */
import { readToolRecord } from './browser.mjs'
import * as steps from './steps.mjs'

/** How many clean runs the result layer needs before it can call anything deviated. */
const BASELINE_RUNS = 3

/**
 * Ring 5 — breakage.
 *
 * The page is redesigned by the server, at the same URL, with the same data: the container
 * class and the field classes change. That is the ordinary life of a web page, and it is
 * also why `CONTAINER_MISSING` is not an error — nothing failed, the selectors simply
 * stopped matching.
 */
export async function ringHealth(ctx, report) {
  report.section('Ring 5 — health: the page changes under a working tool')

  let runs = 0
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const known = await readToolRecord({ worker: ctx.worker, toolId: ctx.toolId })
    runs = known?.health?.recent_runs?.length ?? 0
    if (runs >= BASELINE_RUNS) break
    await steps.reload(ctx.page, ctx.pageUrl)
    await steps.waitForRows(ctx.page, 4)
  }
  report.check('5.1 clean runs built a baseline to judge against', runs >= BASELINE_RUNS, `${String(runs)} runs recorded`)

  await ctx.harness.serveVariant('changed')
  await steps.reload(ctx.page, ctx.pageUrl)

  await ctx.page.waitForSelector('.jx-run-panel', { state: 'visible', timeout: 60_000 })
  const emptyText = await ctx.page.locator('.jx-run-panel').innerText()
  report.check('5.2 the redesigned page answers honestly: nothing matched', emptyText.includes('Nothing on this page matched this tool.'))

  await steps.waitForDegradedBadge(ctx.page)
  const verdict = await readToolRecord({ worker: ctx.worker, toolId: ctx.toolId })
  report.equals('5.3 health lands on degraded — not broken, and not silence', verdict.health.status, 'degraded')
  report.note(`status ${verdict.health.status}, judged against ${String(verdict.health.recent_runs.length)} recorded runs`)

  // The detail is closed until asked for — that is the whole "light by design" rule (§7),
  // so reading it means opening it the way a person would.
  if (!(await steps.visible(ctx.page, '.jx-health-detail'))) {
    await ctx.page.locator('.jx-health-q').click()
  }
  await ctx.page.waitForSelector('.jx-health-detail', { state: 'visible', timeout: 30_000 })
  const detail = await steps.healthDetailText(ctx.page)
  report.check('5.4 the explanation and the way forward sit inside the detail', detail.length > 0 && detail.includes('Update this tool'))
}

/**
 * Ring 6 — repair. Same build flow, first turn already written (§9.3), and it must still
 * show the user the page before it asks them to trust anything.
 */
export async function ringRepair(ctx, report) {
  report.section('Ring 6 — repair: update the tool against the redesign')
  await steps.startUpdateFromHealth(ctx.page)

  const preset = await steps.composerPresetText(ctx.page)
  report.check('6.1 the flow opens with the context already written by the tool', preset.includes('This tool has started coming back empty'), preset)

  await steps.waitForProposal(ctx.page)
  const boxes = await steps.highlightCount(ctx.page)
  report.check('6.2 a repair highlights the page too — confirmation is not a first-build-only rule', boxes > 0, `${String(boxes)} boxes`)

  const proposal = await ctx.page.locator('.jx-proposal').innerText()
  report.check('6.3 the proposal describes the redesigned page, not the old one', proposal.includes('name') && proposal.includes('cost'))

  await steps.confirmProposal(ctx.page)
  const rows = await steps.waitForRows(ctx.page, 4)
  report.equals('6.4 the repaired version reads every row again', rows, 4)

  const record = await readToolRecord({ worker: ctx.worker, toolId: ctx.toolId })
  report.equals('6.5 the repair wrote a new version', record.definition.version, 3)
  report.equals('6.6 every earlier version is still there to roll back to', record.versions.length, 3)
  report.equals('6.7 a new version starts from healthy', record.health.status, 'healthy')
}

/**
 * Ring 7 — rollback. Nothing about a repair is destructive, and this is the proof: the
 * version in effect can be moved backwards, and the tool runs the moment it is.
 */
export async function ringRollback(ctx, report) {
  report.section('Ring 7 — rollback')
  await steps.openConfig(ctx.page)

  // Through the command chip, not the link: both exist for every command (1-16), and the
  // whole point of `via` is that either one works.
  await ctx.page.locator('.jx-config .jx-cmd', { hasText: '/versions' }).click()
  await ctx.page.waitForSelector('.jx-versions .jx-version', { timeout: 60_000 })

  const versions = await ctx.page.locator('.jx-versions .jx-version').count()
  report.equals('7.1 the history lists every version', versions, 3)

  const note = await steps.rollbackTo(ctx.page, 2)
  report.check('7.2 rolling back names the version now in effect', note.includes('Now using v2.'), note)

  const record = await readToolRecord({ worker: ctx.worker, toolId: ctx.toolId })
  report.equals('7.3 the record serves version 2 again', record.definition.version, 2)
  report.equals('7.4 rolling back removed nothing', record.versions.length, 3)

  /**
   * Rolling back is observable in what the tool reads, which is the only proof that matters.
   *
   * v2 was built for the *original* markup, so on the redesigned page it must find nothing —
   * that emptiness is the rollback working, not a failure. And the pair is what makes it
   * evidence: put the original page back and the restored version reads every row again.
   */
  const afterRollback = await steps.waitForRows(ctx.page, 0)
  report.equals('7.5 the restored version is the one running (old selectors, redesigned page)', afterRollback, 0)

  await ctx.harness.serveVariant('shop')
  await steps.reload(ctx.page, ctx.pageUrl)
  const restored = await steps.waitForRows(ctx.page, 4)
  report.equals('7.6 with the page back to its old shape the restored version reads every row', restored, 4)
}
