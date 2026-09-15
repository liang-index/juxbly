/**
 * Ring 8 — the surfaces that exist so a person can see the seams (stage 1-15 export,
 * stage 1-16 config / inspect / commands / identity).
 *
 * These are presence and labelling checks, not full behaviour checks, and the difference is
 * deliberate: delivering a file and copying to the clipboard are *by design* things only a
 * person can confirm — Chrome gates both behind a real gesture and a real download folder,
 * and pretending otherwise in CI would produce green checks nobody can trust. They are
 * manual-acceptance items, listed as such in the stage report.
 */
import * as steps from './steps.mjs'

export async function ringSurfaces(ctx, report) {
  report.section('Ring 8 — the open-source surfaces')

  await steps.openRunTab(ctx.page, 'Result')
  const actions = await steps.exportActions(ctx.page)
  report.equals('8.1 copy / CSV / JSON are offered for a result', actions, 3)

  const inspectSteps = await steps.openInspect(ctx.page)
  report.equals('8.2 the inspect tab lists every step of the definition', inspectSteps, 3)

  const detail = await ctx.page.locator('.jx-step-detail').innerText()
  report.check('8.3 each step reports its input, output and duration', detail.includes('Input') && detail.includes('Output') && detail.includes('Duration'))

  await steps.openConfig(ctx.page)
  const config = await ctx.page.locator('.jx-config').innerText()
  report.check(
    '8.4 the capability summary says what the definition will do before it runs',
    config.includes('Read text from this page') && config.includes('Send what it read to your model provider'),
  )
  report.check('8.5 editing warns that it saves a new version', config.includes('Editing saves a new version'))

  const commands = await ctx.page.locator('.jx-config .jx-cmd').count()
  report.equals('8.6 three commands are listed', commands, 3)

  // The options page is a different surface of the same extension: identity for a bug
  // report, and two kinds of feedback with nothing attached automatically (§9.2).
  const options = await ctx.context.newPage()
  await options.goto(`chrome-extension://${ctx.extensionId}/options.html`, { waitUntil: 'domcontentloaded' })
  await options.waitForSelector('h1', { timeout: 60_000 })
  const text = await options.locator('body').innerText()

  report.check('8.7 the options page names the version a bug report would quote', text.includes('open source build'))
  report.check('8.8 feedback offers both kinds of feedback, with nothing attached', text.includes('Report a problem') && text.includes('Suggest a scenario'))
  await options.close()
}
