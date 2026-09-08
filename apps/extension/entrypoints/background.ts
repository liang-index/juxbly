import { createChromeAdapter } from '@juxbly/browser'
import {
  createLogger,
  isBuildPropose,
  isBuildSaveTool,
  isPing,
  isRunLlm,
  isRunLoadState,
  isRunReport,
  isToolDelete,
} from '@juxbly/core'
import type {
  InternalPong,
  OnboardingGetResultMessage,
  RunLoadStateResultMessage,
  RunReportMessage,
  ToolDeleteResultMessage,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { matchUrl } from '@juxbly/dsl'
import { handleBuildPropose, handleRunLlm } from '@juxbly/llm'
import {
  deleteTool,
  handleBuildSaveTool,
  loadOnboardingFlags,
  loadSettings,
  loadTool,
  loadTools,
  markFirstToolBuilt,
  recordRunResult,
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
 * round trips (`run:load_state` / `run:report`) and `tool:delete`.
 *
 * The `chrome.*` calls below are the assembly-layer exception defined in
 * `docs/ARCHITECTURE.md` §6.4.1 — registration and relay only, no business logic.
 * Everything they delegate to lives in `packages/*`.
 */

const log = createLogger('BUILD')

export default defineBackground(() => {
  // The service worker is stopped and recreated without warning, so no state lives in
  // module scope and nothing here may touch `window`.

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
 */
export async function handleRunReport(message: RunReportMessage): Promise<void> {
  const adapter = createChromeAdapter()
  await recordRunResult(adapter, message.toolId, {
    at: message.summary.at,
    ...(message.runState === undefined ? {} : { runState: message.runState }),
  })
  if (message.ok === true) {
    await markFirstToolBuilt(adapter)
  }
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
