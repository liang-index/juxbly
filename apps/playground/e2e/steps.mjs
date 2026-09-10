/**
 * The UI steps — one exported function per thing a person can see happen.
 *
 * Every step drives the real DOM through real input. Nothing here posts a message into the
 * extension, patches storage mid-flow, or calls an internal function: the whole point of
 * the stage is to prove the rings connect, and a shortcut would only prove the steps run.
 *
 * Selectors are the ones the product renders (`.jx-*`), never test ids the product does not
 * already ship. Playwright pierces open shadow DOM for CSS and role selectors alike, which
 * is exactly how a user reaches the same elements — through `#juxbly-root`'s shadow host.
 */
const TIMEOUT = 60_000

/** The floating ball → the composer. Nothing else opens it (UI_SPEC §8). */
export async function openComposer(page) {
  await page.waitForSelector('.jx-ball', { state: 'visible', timeout: TIMEOUT })
  await page.locator('.jx-ball').click()
  await page.waitForSelector('textarea.jx-input', { state: 'visible', timeout: TIMEOUT })
}

/** Types and sends, the way a person does: Enter sends (UI_SPEC §8). */
export async function say(page, text) {
  const composer = page.locator('textarea.jx-input')
  await composer.fill(text)
  await composer.press('Enter')
}

/** The clarification a model owes when the request is unclear (§9.1). */
export async function waitForClarification(page) {
  await page.waitForSelector('.jx-stream .jx-msg[data-clarification="true"]', { timeout: TIMEOUT })
  return page.locator('.jx-stream .jx-msg[data-clarification="true"]').first().innerText()
}

/** The proposal, with its confirmation — the step that spends nothing until it is taken. */
export async function waitForProposal(page) {
  await page.waitForSelector('.jx-proposal', { state: 'visible', timeout: TIMEOUT })
}

/**
 * The highlight boxes, counted after the fact.
 *
 * Counting them is the only machine-checkable part of "the page was shown to the user"
 * (§7.5) — whether they land on the right pixels is a manual-acceptance question, and it
 * is asked separately on real pages.
 */
export async function highlightCount(page) {
  return page.locator('.jx-highlight-layer .jx-highlight').count()
}

export async function confirmProposal(page) {
  await page.locator('.jx-proposal .jx-btn.is-primary').click()
}

/**
 * Whether an element is actually on screen.
 *
 * Both panels are mounted (and swapped by a `hidden` attribute), so "is it in the DOM"
 * answers a different question from "would a person see it" — see `mount.tsx` for why the
 * product keeps them mounted.
 */
export async function visible(page, selector) {
  return page.locator(selector).first().isVisible().catch(() => false)
}

/** Waits for the run panel's rendered row count to settle on `expected`. */
export async function waitForRows(page, expected, timeoutMs = TIMEOUT) {
  const deadline = Date.now() + timeoutMs
  let seen = -1
  while (Date.now() < deadline) {
    seen = await page.locator('.jx-run-result .jx-table tbody tr').count()
    if (seen === expected) return seen
    await page.waitForTimeout(200)
  }
  return seen
}

/** A page load the product sees: the auto-run fires on load, nothing else is asked for. */
export async function reload(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
  await page.waitForSelector('#juxbly-root', { timeout: TIMEOUT })
}

export async function openRunTab(page, label) {
  await page.locator('.jx-run-panel .jx-tab', { hasText: label }).click()
}

/** The degraded corner "?" — light by design (UI_SPEC §7), so waiting may take a run. */
export async function waitForDegradedBadge(page) {
  await page.waitForSelector('.jx-health-q', { state: 'visible', timeout: TIMEOUT })
}

/**
 * Opens the detail and takes the update entry, which is the same build flow preset.
 *
 * Idempotent about the "?" — it is a toggle, and a previous step may well have opened the
 * detail already (the report reads it). Clicking twice would close it again and the next
 * wait would time out against a panel that is working perfectly.
 */
export async function startUpdateFromHealth(page) {
  if (!(await visible(page, '.jx-health-detail'))) {
    await page.locator('.jx-health-q').click()
    await page.waitForSelector('.jx-health-detail', { state: 'visible', timeout: TIMEOUT })
  }
  await page.locator('.jx-health-detail button', { hasText: 'Update this tool' }).click()
  await page.waitForSelector('textarea.jx-input', { state: 'visible', timeout: TIMEOUT })
}

/** The degraded badge's own words, as rendered — never reconstructed by the script. */
export async function healthDetailText(page) {
  return page.locator('.jx-health-detail').innerText()
}

/** Whether the repaired/opened build conversation carries the preset context message. */
export async function composerPresetText(page) {
  return page.locator('.jx-stream .jx-msg.is-user').first().innerText()
}

export async function streamText(page) {
  return page.locator('.jx-stream').innerText()
}

export async function openConfig(page) {
  await openRunTab(page, 'Config')
  await page.waitForSelector('.jx-config', { state: 'visible', timeout: TIMEOUT })
}

/**
 * Rewrites the definition by hand and saves it as a new version — stage 1-16's surface,
 * driven exactly as a person drives it: read the editor, replace its contents, save.
 */
export async function editDefinition(page, mutate) {
  const editor = page.locator('.jx-editor')
  await page.waitForSelector('.jx-editor', { state: 'visible', timeout: TIMEOUT })
  const current = JSON.parse(await editor.inputValue())
  const next = await mutate(current)
  await editor.fill(JSON.stringify(next, null, 2))
  return next
}

export async function saveDefinition(page) {
  await page.locator('.jx-config-buttons button', { hasText: 'Save as new version' }).click()
}

export async function waitForSaveNote(page) {
  await page.waitForSelector('.jx-config-feedback[data-tone="ok"]', { timeout: TIMEOUT })
  return page.locator('.jx-config-feedback').innerText()
}

export async function expandVersions(page) {
  await page.locator('.jx-config-versions button', { hasText: 'Versions' }).click()
  await page.waitForSelector('.jx-versions .jx-version', { timeout: TIMEOUT })
}

/**
 * Rolls back to one specific version by its rollback button — not by index, so reordering
 * the list cannot silently make this pass.
 */
export async function rollbackTo(page, version) {
  await page
    .locator(`.jx-versions .jx-version:has(.jx-version-name:text-is("v${version}")) button`)
    .click()
  await page.waitForSelector('.jx-config-feedback[data-tone="ok"]', { timeout: TIMEOUT })
  return page.locator('.jx-config-feedback').innerText()
}

export async function openInspect(page) {
  await openRunTab(page, 'Inspect')
  await page.waitForSelector('.jx-inspect-tab', { state: 'visible', timeout: TIMEOUT })
  return page.locator('.jx-steps .jx-step').count()
}

/** Stage 1-15's three export actions — presence and labelling only; see the known issues. */
export async function exportActions(page) {
  return page.locator('.jx-run-actions button[aria-label^="Copy result"], .jx-run-actions button[aria-label^="Download result"]').count()
}

/** Switches the result view — a local re-render, never a new run (§7.1). */
export async function switchView(page, label) {
  await page.locator('.jx-run-actions .jx-tab', { hasText: label }).click()
}

export async function clickRefresh(page) {
  await page.locator('.jx-run-actions button', { hasText: 'Refresh' }).click()
}
