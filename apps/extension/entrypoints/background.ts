import { createLogger, isPing } from '@juxbly/core'
import type { InternalPong } from '@juxbly/core'
import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'

/**
 * Background service worker — message router and the only context that ever sees a
 * BYOK key (`docs/ARCHITECTURE.md` §7.1).
 *
 * Stage 0-3 lands the router skeleton plus the channel probe; the message kinds it
 * will eventually dispatch arrive with the stages that own them.
 *
 * The `chrome.*` calls below are the assembly-layer exception defined in
 * `docs/ARCHITECTURE.md` §6.4.1 — registration only, no business logic. Everything
 * they delegate to lives in `packages/*`.
 */

const log = createLogger('BUILD')

export default defineBackground(() => {
  // The service worker is stopped and recreated without warning, so no state lives in
  // module scope and nothing here may touch `window`.

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isPing(message)) return undefined

    log.info('received ping')
    return Promise.resolve<InternalPong>({ kind: 'internal:pong', ok: true })
  })

  browser.commands.onCommand.addListener((command) => {
    // Invoking the panel is stage 1-8. Until then the command proves the event arrives.
    log.info('command received', command)
  })

  browser.runtime.onInstalled.addListener((details) => {
    log.info('installed', details.reason)
  })

  log.info('service worker ready')
})
