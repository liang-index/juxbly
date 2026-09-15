/**
 * Rings 1–4 of the lifecycle: discover → build → confirm → save → run.
 *
 * The ring names track `docs/concepts/tool-lifecycle.md`, so a reader can line this script
 * up with the product's own description of what a tool goes through.
 */
import { readToolRecord } from './browser.mjs'
import * as steps from './steps.mjs'

/**
 * Ring 1 — discovery. Nothing exists yet, so what matters is that the product introduces
 * itself without demanding anything: no tool, no key wall, one sentence offered in-band.
 */
export async function ringDiscover(ctx, report) {
  report.section('Ring 1 — discover (nothing saved yet)')
  await steps.reload(ctx.page, ctx.pageUrl)
  await ctx.page.waitForSelector('.jx-ball', { state: 'visible', timeout: 60_000 })

  const runPanelShown = await steps.visible(ctx.page, '.jx-run-panel')
  report.check('1.1 no tool is auto-opened on a page with nothing saved', !runPanelShown)

  await ctx.page.locator('.jx-ball').click()
  await ctx.page.waitForSelector('textarea.jx-input', { state: 'visible', timeout: 60_000 })
  const stream = await steps.streamText(ctx.page)
  report.check('1.2 the opening line is offered in the conversation', stream.includes('I can see this page'))
}

/**
 * Ring 2 — build. The model is asked once as a clarification and once for real, which is
 * the behaviour §9.1 pins: unclear requests get a question, not a guess.
 */
export async function ringBuild(ctx, report) {
  report.section('Ring 2 — build (clarify, then propose with the page shown)')
  await ctx.harness.scenario({ proposeMode: 'clarify-first' })

  await steps.say(ctx.page, 'organize this page')
  const question = await steps.waitForClarification(ctx.page)
  report.check('2.1 an unclear request is answered with a question, not a proposal', question.length > 0, question)

  await steps.say(ctx.page, 'Just the name and price of each product.')
  await steps.waitForProposal(ctx.page)

  const boxes = await steps.highlightCount(ctx.page)
  report.check('2.2 the proposal highlights what it intends to read', boxes > 0, `${String(boxes)} boxes`)

  const fields = await ctx.page.locator('.jx-proposal').innerText()
  report.check('2.3 the proposal names the fields it will read', fields.includes('title') && fields.includes('price'))
}

/** Ring 3 — save. The confirmed definition becomes a record, at version 1. */
export async function ringSave(ctx, report) {
  report.section('Ring 3 — save')
  await steps.confirmProposal(ctx.page)
  await ctx.page.waitForSelector('.jx-run-panel', { state: 'visible', timeout: 60_000 })

  const rows = await steps.waitForRows(ctx.page, 4)
  report.equals('3.1 the saved tool runs on its own and reads every row', rows, 4)

  const record = await readToolRecord({ worker: ctx.worker, toolId: ctx.toolId })
  report.check('3.2 a record exists at version 1', record !== null && record.definition.version === 1, `v${String(record?.definition?.version)}`)
  report.equals('3.3 the version history holds exactly one entry', record?.versions?.length, 1)
}

/**
 * Ring 4 — run, and the three promises the run panel makes about spending:
 *
 * - the same input never asks the model twice (§9.2, the engine's hash cache);
 * - switching a view redraws local data, nothing more (§7.1 rule 1);
 * - the manual refresh is the only thing that forces the model (rule 2).
 *
 * An `llm` step is added here by hand through the config tab, which is also stage 1-16's
 * save-as-new-version surface: the edit is what makes all three measurable.
 */
export async function ringRun(ctx, report) {
  report.section('Ring 4 — run: cache, view switching, and forced refresh')

  await steps.openConfig(ctx.page)
  await steps.editDefinition(ctx.page, (definition) => ({
    ...definition,
    steps: [
      definition.steps[0],
      // Inserted before `render`: a V1 tool is linear, and this is where a person would
      // put it — after what it reads, before what it draws.
      {
        type: 'llm',
        task: 'classify',
        input_from: 'raw_items',
        output_to: 'classified',
        prompt: 'One short label per row.',
      },
      ...definition.steps.slice(1),
    ],
  }))
  await steps.saveDefinition(ctx.page)
  const note = await steps.waitForSaveNote(ctx.page)
  report.check('4.1 the edit saved a new version instead of overwriting', note.includes('Saved as v2.'), note)

  const rows = await steps.waitForRows(ctx.page, 4)
  report.equals('4.2 the new version ran on save', rows, 4)

  const afterEdit = await ctx.harness.calls()
  report.equals('4.3 the unseen run asked the model once', afterEdit.step, 1)

  await steps.reload(ctx.page, ctx.pageUrl)
  const reloaded = await steps.waitForRows(ctx.page, 4)
  report.equals('4.4 a page load re-reads the page', reloaded, 4)
  const cached = await ctx.harness.calls()
  report.equals('4.5 the same input did not ask the model again (llm cache)', cached.step, afterEdit.step)

  await steps.switchView(ctx.page, 'Card')
  await steps.switchView(ctx.page, 'Text')
  await steps.switchView(ctx.page, 'Table')
  const viewsRows = await steps.waitForRows(ctx.page, 4)
  report.equals('4.6 switching views kept every row', viewsRows, 4)
  const afterViews = await ctx.harness.calls()
  report.equals('4.7 switching views did not re-run the pipeline', afterViews.step, cached.step)

  await steps.clickRefresh(ctx.page)
  await ctx.page.waitForTimeout(2500)
  const forced = await ctx.harness.calls()
  report.equals('4.8 the manual refresh forced the model', forced.step, cached.step + 1)
}
