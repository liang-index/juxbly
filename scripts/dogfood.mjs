#!/usr/bin/env node
/**
 * Dogfooding harness — Phase 3-1 (`docs/ROADMAP.md`).
 *
 *   JX_API_KEY=sk-... node scripts/dogfood.mjs --url <url> --task "<task>" [--answer "<text>"]
 *
 * Why this exists. The benchmark replays frozen snapshots against recorded answers, so it
 * can only ever find again what it has already seen. Dogfooding is the opposite: the built
 * extension in a real Chromium, on a live page, against a live model. It reuses the
 * lifecycle harness's browser and step helpers on purpose — the acceptance path and the
 * dogfooding path exercise the same surface, so a finding here is a finding about the
 * product and not about a second driver nobody maintains.
 *
 * It drives only what a person can click. The one thing written straight into storage is the
 * BYOK endpoint, because configuring it through the options page is stage 1-13's surface
 * (already accepted) and every remaining pass should start from "there is a key", not from
 * an empty settings form.
 *
 * Cost and latency travel with every pass. The first dogfooding run captured neither, which
 * made two runs of the same request incomparable: these steps call an endpoint the user pays
 * for, and "it felt slower" is not a measurement. Both are read off what the UI shows a user
 * (§9 rule 4, BYOK transparency) rather than out of internal state, so what the harness
 * records and what a person watching the same pass would see cannot disagree.
 *
 * Nothing in the output directory is publishable as-is: it holds live page content. A recipe
 * is authored from a pass afterwards and checked against `docs/contributing/RECIPE_GUIDE.md`
 * before it lands.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  launchWithExtension,
  readToolRecords,
  writeEndpoint,
} from '../apps/playground/e2e/browser.mjs'
import { loadPlaywright } from '../apps/playground/e2e/playwright.mjs'
import * as steps from '../apps/playground/e2e/steps.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXTENSION_PATH = join(ROOT, '.output/chrome-mv3')
const TIMEOUT_MS = 90_000
// Heavy pages (dev.to, react.dev) have proposal calls that outlast two minutes — a person
// keeps watching the streaming panel, so the harness can too, via `JX_PROPOSAL_BUDGET_MS`.
const PROPOSAL_BUDGET_MS = Number(process.env.JX_PROPOSAL_BUDGET_MS ?? 120_000)
const SETTLE_BUDGET_MS = 60_000

/** A missing digit is a missing reading, never a zero — `0 tokens` would flatter the run. */
function integers(text) {
  return (text ?? '').match(/[\d,]+/g)?.map((n) => Number(n.replace(/,/g, ''))) ?? []
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`)
    args[key.slice(2)] = argv[i + 1]
    i += 1
  }
  return args
}

function usage(message, code = 1) {
  console.log(
    [
      message,
      '',
      '  JX_API_KEY=sk-... node scripts/dogfood.mjs --url <url> --task "<request>" [--answer "<clarification>"]',
      '',
      '  --url        the live page to build against (required)',
      '  --task       the request, typed as a person would type it (required)',
      '  --answer     one reply, used only if the build asks a clarifying question',
      '  --out        output directory (default .dogfood/<timestamp>-<host>)',
      '',
      'Environment: JX_API_KEY (required), JX_API_BASE_URL, JX_MODEL, JX_PROPOSAL_BUDGET_MS, JUXBLY_PLAYWRIGHT_HOME.',
    ].join('\n'),
  )
  process.exit(code)
}

/**
 * Token readings come in two flavours because they come from two different surfaces: the
 * build chat prints one total for everything the proposal cost, and the run panel prints a
 * per-run prompt / completion pair — and prints nothing at all when the tool has no `llm`
 * step. Both are absent rather than zero when there is nothing to read, because "0 tokens"
 * is a claim about the run, not the absence of a measurement.
 */
async function readTokens(page) {
  const buildText = (await page.locator('[data-testid="usage"]').allInnerTexts()).at(-1)
  const runMeta = await page.locator('.jx-run-panel .jx-run-meta').allInnerTexts()
  const shown = runMeta.find((t) => t.includes('tokens'))
  const [promptTokens, completionTokens] = shown === undefined ? [] : integers(shown)
  return {
    build: {
      total: buildText === undefined ? null : (integers(buildText)[0] ?? null),
      shown: buildText ?? null,
    },
    run: {
      prompt_tokens: promptTokens ?? null,
      completion_tokens: completionTokens ?? null,
      total: promptTokens === undefined ? null : promptTokens + completionTokens,
      shown: shown ?? null,
    },
  }
}

async function settleRows(page) {
  let rows = 0
  let stable = 0
  const until = Date.now() + SETTLE_BUDGET_MS
  while (Date.now() < until) {
    const n = await page.locator('.jx-run-result .jx-table tbody tr').count()
    if (n === rows && n > 0) {
      if ((stable += 1) >= 3) break
    } else {
      stable = 0
      rows = n
    }
    await page.waitForTimeout(400)
  }
  return rows
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.JX_API_KEY
  const baseUrl = process.env.JX_API_BASE_URL ?? 'https://api.deepseek.com/v1'
  const model = process.env.JX_MODEL ?? 'deepseek-chat'

  if (apiKey === undefined || apiKey === '') usage('JX_API_KEY is not set.')
  if (args.url === undefined || args.task === undefined) usage('--url and --task are required.')
  if (!existsSync(join(EXTENSION_PATH, 'manifest.json'))) usage('No built extension. Run `pnpm build` first.')

  const host = new URL(args.url).hostname.replace(/^www\./, '')
  const out = args.out ?? join(ROOT, '.dogfood', `${new Date().toISOString().slice(0, 19).replace(/[:]/g, '')}-${host}`)
  mkdirSync(out, { recursive: true })

  const log = (...a) => console.log('[dogfood]', ...a)
  log('output', out)
  log('endpoint', baseUrl, model)

  const { chromium } = await loadPlaywright()
  const browser_ = await launchWithExtension({ chromium, extensionPath: EXTENSION_PATH })
  const { context, worker } = browser_

  const startedAt = Date.now()
  try {
    await writeEndpoint({ worker, apiKey, baseUrl, model })

    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push(m.text())
    })

    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
    const pageLoadedMs = Date.now() - startedAt
    await page.waitForSelector('#juxbly-root', { timeout: TIMEOUT_MS })
    await page.waitForSelector('.jx-ball', { state: 'visible', timeout: TIMEOUT_MS })

    await page.locator('.jx-ball').click()
    await page.waitForSelector('textarea.jx-input', { state: 'visible', timeout: TIMEOUT_MS })
    const requestedAt = Date.now()
    log('task:', args.task)
    await steps.say(page, args.task)

    // The build flow may answer with a clarifying question before it proposes (§9.1). A
    // person answers once; so does this.
    let clarified = false
    let proposed = false
    const until = Date.now() + PROPOSAL_BUDGET_MS
    while (Date.now() < until) {
      if ((await page.locator('.jx-proposal').count()) > 0) {
        proposed = true
        break
      }
      const asking = await page.locator('.jx-stream .jx-msg[data-clarification="true"]').count()
      if (asking > 0 && !clarified && args.answer !== undefined) {
        clarified = true
        log('clarification:', await page.locator('.jx-stream .jx-msg[data-clarification="true"]').first().innerText())
        await steps.say(page, args.answer)
      }
      await page.waitForTimeout(500)
    }
    if (!proposed) throw new Error('no proposal within the budget')
    const proposalMs = Date.now() - requestedAt

    const highlights = await steps.highlightCount(page)
    log('highlights:', highlights, 'in', proposalMs, 'ms')
    await page.screenshot({ path: join(out, 'proposal.png') })

    await steps.confirmProposal(page)
    await page.waitForSelector('.jx-run-panel', { state: 'visible', timeout: TIMEOUT_MS })
    const rows = await settleRows(page)
    const settledMs = Date.now() - requestedAt

    const headers = await page.locator('.jx-run-result .jx-table thead th').allInnerTexts()
    const sampleRows = await page
      .locator('.jx-run-result .jx-table tbody tr')
      .evaluateAll((trs) =>
        trs.slice(0, 3).map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())),
      )
    await page.screenshot({ path: join(out, 'result.png') })
    log('rows:', rows, 'headers:', JSON.stringify(headers))

    // Whatever the build saved is the tool a user would be keeping; a fresh profile holds
    // exactly one, and naming it here would mean knowing the answer before asking.
    const tools = await readToolRecords({ worker })
    const stored = Object.values(tools)[0] ?? null
    if (stored !== null) writeFileSync(join(out, 'tool.json'), JSON.stringify(stored, null, 2))
    else log('WARN no tool record found (the build did not save one)')

    const record = {
      url: args.url,
      task: args.task,
      clarification_asked: clarified,
      endpoint: { base_url: baseUrl, model },
      rows,
      headers,
      sample_rows: sampleRows,
      highlights,
      // Latency is wall clock, which is what a user waits — including network and the model.
      timings_ms: { page_loaded: pageLoadedMs, proposal: proposalMs, settled: settledMs },
      tokens: await readTokens(page),
      panelText: (await page.locator('.jx-run-panel').innerText()).slice(0, 1500),
      page_errors: pageErrors,
      note: 'Live page content. Author a recipe from this by hand; never commit it.',
    }
    writeFileSync(join(out, 'report.json'), JSON.stringify(record, null, 2))
    log('tokens:', JSON.stringify(record.tokens))
    log('timings:', JSON.stringify(record.timings_ms))
    log('done. page errors:', pageErrors.length === 0 ? 'none' : pageErrors)
  } finally {
    await browser_.close()
  }
}

if (process.argv.includes('--help')) usage('Dogfooding harness — Phase 3-1.', 0)
main().catch((error) => {
  console.error('FAILED', error.message ?? error)
  process.exit(1)
})
