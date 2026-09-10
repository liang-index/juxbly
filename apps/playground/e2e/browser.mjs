/**
 * Loading the unpacked extension into a real browser.
 *
 * Why real, and Headed (`headless: false`): MV3 extensions are loaded by the browser, not
 * by the page, and this machine's Chrome refuses `--load-extension` for unpacked builds
 * entirely — Chromium's own build does not. Everything below therefore runs against a
 * Chromium binary Playwright owns, in a throwaway profile, exactly the way
 * `docs/DEVELOPMENT.md` tells a contributor to load it.
 *
 * Nothing here reaches past what a person could click. The one thing written directly to
 * `chrome.storage` is the BYOK endpoint — and only because configuring it through the
 * options page is stage 1-13's surface, already accepted, and every remaining ring should
 * start from "there is a key pointing at this recording", not from an empty settings form.
 *
 * The key below is not a credential. It is never sent over a network: the recording it
 * authorises against is the loopback server the same process started.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A placeholder, not a secret: it authorises nothing beyond the loopback recording. */
export const RECORDED_MODEL_KEY = 'sk-local-recorded-model'
export const RECORDED_MODEL_NAME = 'recorded-model'

export async function launchWithExtension({ chromium, extensionPath }) {
  const profile = mkdtempSync(join(tmpdir(), 'juxbly-lifecycle-'))
  const context = await chromium.launchPersistentContext(profile, {
    // See above: extensions do not load under this machine's Chrome, and MV3 workers need
    // a real browser profile.
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      // Fixes a visible difference between a machine and a person: animations would
      // otherwise make "did the highlight appear" a race.
      '--force-prefers-reduced-motion',
    ],
  })

  const worker = await waitForWorker(context)
  const extensionId = new URL(worker.url()).host

  return {
    context,
    worker,
    extensionId,
    close: async () => {
      await context.close()
    },
  }
}

/** The service worker registers asynchronously; polling is the honest wait. */
async function waitForWorker(context, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const [worker] = context.serviceWorkers()
    if (worker !== undefined) return worker
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('the extension service worker never appeared (30s)')
}

/** Points the extension at the recorded model. Nothing else is configured by the harness. */
export async function writeRecordedEndpoint({ worker, baseUrl }) {
  await worker.evaluate(
    async (payload) => {
      await chrome.storage.local.set({ 'juxbly:settings': payload })
    },
    {
      api_key: RECORDED_MODEL_KEY,
      api_base_url: baseUrl,
      model: RECORDED_MODEL_NAME,
      floating_ball_enabled: true,
    },
  )
}

/** Reads one tool record back — the only storage read, and it reads facts the UI drew. */
export async function readToolRecord({ worker, toolId }) {
  return worker.evaluate(async (id) => {
    const stored = await chrome.storage.local.get('juxbly:tools')
    const tools = stored['juxbly:tools'] ?? {}
    return tools[id] ?? null
  }, toolId)
}

/** Empties storage between scenarios; nothing else carries state across a lifecycle. */
export async function clearStorage({ worker }) {
  await worker.evaluate(async () => {
    await chrome.storage.local.clear()
  })
}
