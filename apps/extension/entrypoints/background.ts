import { createChromeAdapter } from '@juxbly/browser'
import { cleanFilename } from '@juxbly/capabilities/export'
import {
  createLogger,
  isBuildPropose,
  isBuildSaveTool,
  isExportDownloadCsv,
  isExportDownloadJson,
  isExportRecordUsage,
  isHealthSemanticCheck,
  isPing,
  isRunLlm,
  isRunLoadState,
  isRunReport,
  isToolDelete,
} from '@juxbly/core'
import type {
  ExportDownloadCsvMessage,
  ExportDownloadJsonMessage,
  ExportDownloadResultMessage,
  HealthSemanticCheckResultMessage,
  InternalPong,
  OnboardingGetResultMessage,
  RunLoadStateResultMessage,
  RunReportMessage,
  RunReportResultMessage,
  ToolDeleteResultMessage,
} from '@juxbly/core'
import type { ExtractError, RunError, ToolHealth } from '@juxbly/core'
import type { ToolDefinition, ToolStep } from '@juxbly/dsl'
import { matchUrl } from '@juxbly/dsl'
import { handleBuildPropose, handleRunLlm, loadLlmEndpoint, runSemanticCheck } from '@juxbly/llm'
import { appendRun, capSample, captureFingerprint, evaluateHealth } from '@juxbly/health'
import {
  deleteTool,
  handleBuildSaveTool,
  loadOnboardingFlags,
  loadSettings,
  loadTool,
  loadTools,
  markFirstToolBuilt,
  recordExportResult,
  recordHealthResult,
  recordRunResult,
  runMigrations,
} from '@juxbly/storage'
import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'

/**
 * Background service worker — message router and the only context that ever sees a
 * BYOK key (`docs/ARCHITECTURE.md` §7.1).
 *
 * Stage 0-3 landed the router skeleton plus the channel probe; stage 1-6 added
 * `run:llm`; stage 1-8 adds the shortcut relay (`internal:command`), the public
 * settings read and the matching-tools query; stage 1-9 adds the build flow
 * (`build:propose` / `build:save_tool`); stage 1-10 adds the run layer's two storage
 * round trips (`run:load_state` / `run:report`) and `tool:delete`; stage 1-11 turns
 * `run:report` into the health write path and adds `health:semantic_check`.
 *
 * The `chrome.*` calls below are the assembly-layer exception defined in
 * `docs/ARCHITECTURE.md` §6.4.1 — registration and relay only, no business logic.
 * Everything they delegate to lives in `packages/*`.
 */

const log = createLogger('BUILD')

export default defineBackground(() => {
  // The service worker is stopped and recreated without warning, so no state lives in
  // module scope and nothing here may touch `window`.

  // Schema migrations run on every startup. They are idempotent by construction, so
  // "which version is stored" needs no extra key yet: re-running a migration is a no-op,
  // and the day one is not, a schema-version key lands with it.
  void runMigrations(createChromeAdapter()).catch((error: unknown) => {
    // A failed migration must not take the whole worker down: every reader also fills
    // defaults, so an unmigrated record still reads back complete (§8.1).
    log.warn('migration failed', error)
  })

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isPing(message)) {
      log.info('received ping')
      return Promise.resolve<InternalPong>({ kind: 'internal:pong', ok: true })
    }

    if (isRunLlm(message)) {
      // Built per message on purpose: the adapter is stateless and this worker is not,
      // so holding one would risk a dead platform reference after a recycle.
      return handleRunLlm(message, createChromeAdapter())
    }

    // Stage 1-9: the build flow. The content script has no key and no write access to
    // storage, so proposing and saving are both answered here and nowhere else (§7.1).
    if (isBuildPropose(message)) {
      return handleBuildPropose(message, createChromeAdapter())
    }

    if (isBuildSaveTool(message)) {
      return handleBuildSaveTool(message, createChromeAdapter())
    }

    if (isRecord(message, 'settings:get')) {
      return handleSettingsGet()
    }

    if (isRecord(message, 'run:query_tools') && typeof message.url === 'string') {
      return handleRunQueryTools(message.url)
    }

    if (isRecord(message, 'onboarding:get')) {
      return handleOnboardingGet()
    }

    // Stage 1-10: the run layer. A run starts by asking what the previous one left
    // behind and ends by reporting what it cost and whether it worked — both are
    // storage writes, and storage is this context's to make (§7.1).
    if (isRunLoadState(message) && typeof message.toolId === 'string') {
      return handleRunLoadState(message.toolId)
    }

    if (isRunReport(message) && typeof message.toolId === 'string') {
      return handleRunReport(message)
    }

    if (isToolDelete(message) && typeof message.toolId === 'string') {
      return handleToolDelete(message.toolId)
    }

    // Stage 1-15: the export layer. `export:download_*` and `export:record_usage` both
    // land here because the platform `downloads` API and storage are this context's to use —
    // the content script only ever messages (§7.1).
    if (isExportDownloadCsv(message)) {
      return handleExportDownload(createChromeAdapter(), message, message.filename, message.csv)
    }

    if (isExportDownloadJson(message)) {
      return handleExportDownload(createChromeAdapter(), message, message.filename, message.json)
    }

    if (isExportRecordUsage(message)) {
      return handleExportRecordUsage(createChromeAdapter(), message.toolId)
    }

    // Stage 1-11: the semantic health check. The model call and the key both live here
    // (§7.1); the content script sends field names plus a small sample and gets a verdict.
    if (isHealthSemanticCheck(message)) {
      return handleSemanticCheck(message)
    }

    return undefined
  })

  browser.commands.onCommand.addListener((command) => {
    // `commands.onCommand` only fires here, so the toggle is relayed to the active
    // tab's content script (§6.4.1: relay only). No `tabs` permission is requested —
    // query/sendMessage work without it; only reading tab *metadata* would.
    void (async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      for (const tab of tabs) {
        if (tab.id === undefined) continue
        await browser.tabs.sendMessage(tab.id, { kind: 'internal:command', command })
      }
    })().catch((error: unknown) => {
      // A tab without the content script (chrome://, the store, pre-reload) rejects the
      // send — expected, not an error worth surfacing beyond a debug line.
      log.info('command relay skipped', error)
    })
  })

  browser.runtime.onInstalled.addListener((details) => {
    log.info('installed', details.reason)
  })

  log.info('service worker ready')
})

/** Messages cross a trust boundary: shape-check before acting (§7.2 discipline). */
function isRecord(message: unknown, kind: string): message is { kind: string; url?: unknown } {
  return typeof message === 'object' && message !== null && (message as { kind?: unknown }).kind === kind
}

/**
 * Stage 1-8 request handlers. The content script asks (never reads `juxbly:settings`
 * itself — the BYOK key must not enter the page context, §12) and the background answers
 * with the public subset only.
 */
export async function handleSettingsGet(): Promise<{
  kind: 'settings:get_result'
  floating_ball_enabled: boolean
}> {
  const settings = await loadSettings(createChromeAdapter())
  // Unconfigured defaults to on: the ball is the product's only always-visible anchor.
  return {
    kind: 'settings:get_result',
    floating_ball_enabled: settings?.floating_ball_enabled !== false,
  }
}

export async function handleRunQueryTools(url: string): Promise<{
  kind: 'run:query_tools_result'
  tools: ToolDefinition[]
}> {
  const adapter = createChromeAdapter()
  const records = await loadTools(adapter)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { kind: 'run:query_tools_result', tools: [] }
  }

  const tools = Object.values(records)
    .map((record) => record.definition)
    .filter((definition) => matchUrl(definition.url_pattern, parsed))

  return { kind: 'run:query_tools_result', tools }
}

/**
 * A `null` run state is the honest answer for a first run, not an error — the caller
 * simply runs everything.
 */
export async function handleRunLoadState(toolId: string): Promise<RunLoadStateResultMessage> {
  const record = await loadTool(createChromeAdapter(), toolId)
  return { kind: 'run:load_state_result', toolId, runState: record?.run_state ?? null }
}

/**
 * What a finished run leaves behind (§8.1): `run_count` / `last_run_at` on every run,
 * `run_state` when the run produced one (a cancelled run sends nothing), and
 * `first_tool_built` only when the run **worked** — a tool that ran and failed has not
 * yet shown the user the thing the flag promises.
 *
 * Stage 1-11 turns this into the health write path as well: the run's signals (summary,
 * the engine's extract error, the structure statistics, a small sample) go through
 * `evaluateHealth`, and the resulting `ToolHealth` is what gets stored. The semantic
 * check — the only token-spending layer — runs here only when the evaluation asked for
 * it *and* the caller sent a sample; a failed or keyless check is recorded as
 * `layers.semantic = 'error'` and changes no status (§10: no network is not a broken
 * tool). The reply carries the fresh verdict so the panel can render the badge without
 * a second round trip.
 */
export async function handleRunReport(message: RunReportMessage): Promise<RunReportResultMessage> {
  const adapter = createChromeAdapter()
  const at = message.summary.at

  const stored = await recordRunResult(adapter, message.toolId, {
    at,
    ...(message.runState === undefined ? {} : { runState: message.runState }),
  })
  if (message.ok === true) {
    await markFirstToolBuilt(adapter)
  }

  const record = stored ? await loadTool(adapter, message.toolId) : null
  if (record === null) {
    // A run of a deleted tool: nothing was (or should have been) written.
    return { kind: 'run:report_result', toolId: message.toolId, ok: false }
  }

  const fingerprint =
    message.extract === undefined ? null : captureFingerprint(message.extract, { at })
  const extractError = extractErrorOf(message.error)

  const input = {
    previous: record.health,
    summary: message.summary,
    fingerprint,
    now: Date.now(),
    ...(extractError === null ? {} : { extractError }),
  }
  let evaluation = evaluateHealth(input)
  let health: ToolHealth = {
    ...record.health,
    status: evaluation.status,
    recent_runs: appendRun(record.health.recent_runs, message.summary),
    structure_fingerprint: evaluation.fingerprint,
    last_semantic_check: record.health.last_semantic_check,
    consecutive_clean_runs: evaluation.consecutiveCleanRuns,
  }

  if (evaluation.semanticCheckRequested && (message.sample?.length ?? 0) > 0) {
    const endpoint = await loadLlmEndpoint(adapter)
    const fields = extractFields(record.definition)
    const sample = capSample(message.sample ?? [])

    if (endpoint === null || fields.length === 0) {
      // No key is onboarding's job (1-13); no fields means there is nothing to judge
      // against. Either way the layer reports "error", not a verdict — the status stands.
      evaluation = evaluateHealth({ ...input, semanticError: true })
    } else {
      try {
        const check = await runSemanticCheck(endpoint, fields, sample)
        health = { ...health, last_semantic_check: check }
        // Re-judge with the verdict in hand: `suspicious` is what can escalate a
        // degraded tool to broken when result and structure already agree (§10).
        evaluation = evaluateHealth({ ...input, semantic: check })
        // The log carries the verdict and the cost, never the sample (§7.2 Security).
        log.info('semantic check completed', { verdict: check.verdict, usage: check.usage })
      } catch (error: unknown) {
        const code =
          error instanceof Error && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'INVALID_RESPONSE'
        evaluation = evaluateHealth({ ...input, semanticError: true })
        log.warn('semantic check failed', { code })
      }
    }

    health = {
      ...health,
      status: evaluation.status,
      consecutive_clean_runs: evaluation.consecutiveCleanRuns,
    }
  }

  await recordHealthResult(adapter, message.toolId, health, at)

  return {
    kind: 'run:report_result',
    toolId: message.toolId,
    ok: true,
    health,
    evaluation: {
      status: evaluation.status,
      changed: evaluation.changed,
      reason: evaluation.reason,
      layers: evaluation.layers,
    },
  }
}

/** The extract codes the execution layer reads; anything else is a different layer's signal. */
const EXTRACT_CODES: readonly string[] = [
  'SELECTOR_SYNTAX',
  'CONTAINER_MISSING',
  'DOM_UNAVAILABLE',
  'ABORTED',
]

function extractErrorOf(error: RunError | undefined): ExtractError | null {
  if (error === undefined || !EXTRACT_CODES.includes(error.code)) return null
  return {
    code: error.code as ExtractError['code'],
    message: error.message,
    ...(error.selector === undefined ? {} : { selector: error.selector }),
  }
}

/** The field names the tool's extract step promises — what the semantic layer judges against. */
function extractFields(definition: ToolDefinition): string[] {
  const extract = definition.steps.find((step: ToolStep) => step.type === 'extract')
  if (extract === undefined || !('fields' in extract)) return []
  return Object.keys((extract as { fields: Record<string, string> }).fields)
}

/**
 * The four one-shot milestones carry no secret, so they cross the boundary like the
 * public settings subset does. `null` means "never written" — that is an answer, not an
 * error to default away.
 */
export async function handleOnboardingGet(): Promise<OnboardingGetResultMessage> {
  return {
    kind: 'onboarding:get_result',
    flags: await loadOnboardingFlags(createChromeAdapter()),
  }
}

/** The retention line's "Don't keep" (UI_SPEC §7.3); 1-13 reuses it from the overview. */
export async function handleToolDelete(toolId: string): Promise<ToolDeleteResultMessage> {
  const deleted = await deleteTool(createChromeAdapter(), toolId)
  return {
    kind: 'tool:delete_result',
    ok: deleted,
    toolId,
    ...(deleted ? {} : { error: 'TOOL_NOT_FOUND' }),
  }
}

/**
 * The background side of a download request (stage 1-15) — the *only* place the
 * platform `downloads` API is reached, because it is unavailable to content scripts (§7.1).
 *
 * The filename is re-sanitised here even though the caller already cleaned it: a message
 * crosses a trust boundary, and the download manager is where a bad filename would do the
 * damage. Failure is returned as `ok: false` so the panel can show an error and a retry —
 * a refused download must not read as a delivered one.
 */
export async function handleExportDownload(
  adapter: ReturnType<typeof createChromeAdapter>,
  message: ExportDownloadCsvMessage | ExportDownloadJsonMessage,
  filename: string,
  content: string,
): Promise<ExportDownloadResultMessage> {
  const mime =
    message.kind === 'export:download_json' ? 'application/json' : 'text/csv;charset=utf-8'
  // `filename` already excludes a directory (cleaned at the source); strip any path shape
  // that a hostile sender could still smuggle in defensively.
  const safe = cleanFilename(filename.split('/').pop() ?? 'juxbly-export')

  try {
    await adapter.downloads.download(safe, content, mime)
    // The exported content is page data and never gets near a log line.
    return { kind: 'export:download_result', ok: true }
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error)
    return { kind: 'export:download_result', ok: false, error: reason }
  }
}

/** One export, one usage record: `export_count` +1 and `last_export_at` refreshed (§8.1). */
export async function handleExportRecordUsage(
  adapter: ReturnType<typeof createChromeAdapter>,
  toolId: string,
): Promise<void> {
  await recordExportResult(adapter, toolId, new Date().toISOString())
}

/**
 * The background side of `health:semantic_check` (stage 1-11).
 *
 * This message channel is the **manual** path — the panel's "check now" button, where
 * the throttle is deliberately bypassed: it is the user's action and their tokens
 * (`task/stage-1-11.md`). The *automatic* path never crosses messaging at all: the
 * `run:report` flow evaluates health here, and only a result/structure deviation plus
 * the six-hour throttle opens the gate before `runSemanticCheck` is reached.
 *
 * Failure is `ok: false` with the error category, never a fabricated verdict — a failed
 * check must read as "no answer", and the panel records `layers.semantic = 'error'`
 * without touching the tool's status (§10: no network is not a broken tool).
 */
export async function handleSemanticCheck(message: {
  requestId: string
  fields: string[]
  sample: unknown[]
}): Promise<HealthSemanticCheckResultMessage> {
  const fail = (error: string): HealthSemanticCheckResultMessage => ({
    kind: 'health:semantic_check_result',
    requestId: message.requestId,
    ok: false,
    error,
  })

  if (message.fields.length === 0 || message.sample.length === 0) {
    // Nothing to judge: an empty sample is an empty answer, not an `ok` verdict.
    return fail('INVALID_REQUEST')
  }

  try {
    const endpoint = await loadLlmEndpoint(createChromeAdapter())
    if (endpoint === null) {
      return fail('NOT_CONFIGURED')
    }

    const check = await runSemanticCheck(
      endpoint,
      message.fields,
      // The cap is `capSample` and only `capSample` (§10): the prompt builder sends
      // what it gets, so the sample size must have exactly one enforcer, shared with
      // the automatic path above.
      capSample(message.sample),
    )

    // The log carries the verdict and the cost, never the sample (§7.2 Security).
    log.info('semantic check completed', { verdict: check.verdict, usage: check.usage })
    return {
      kind: 'health:semantic_check_result',
      requestId: message.requestId,
      ok: true,
      verdict: check.verdict,
      reason: check.reason,
      ...(check.usage === undefined ? {} : { usage: check.usage }),
    }
  } catch (error: unknown) {
    const code = error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'INVALID_RESPONSE'
    return fail(code)
  }
}
