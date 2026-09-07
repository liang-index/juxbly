import { createChromeAdapter } from '@juxbly/browser'
import { createLogger, isPing, isRunLlm } from '@juxbly/core'
import type { InternalPong } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { matchUrl } from '@juxbly/dsl'
import { handleRunLlm } from '@juxbly/llm'
import { loadSettings, loadTools } from '@juxbly/storage'
import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'

/**
 * Background service worker — message router and the only context that ever sees a
 * BYOK key (`docs/ARCHITECTURE.md` §7.1).
 *
 * Stage 0-3 landed the router skeleton plus the channel probe; stage 1-6 added
 * `run:llm`; stage 1-8 adds the shortcut relay (`internal:command`), the public
 * settings read and the matching-tools query.
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

    if (isRecord(message, 'settings:get')) {
      return handleSettingsGet()
    }

    if (isRecord(message, 'run:query_tools') && typeof message.url === 'string') {
      return handleRunQueryTools(message.url)
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
