/**
 * Shared logger for every Juxbly context: background service worker, content script,
 * popup and options (`docs/CONVENTIONS.md` §12, `docs/DEVELOPMENT.md` §Debugging).
 *
 * Every line carries a `[JUXBLY][<TAG>]` prefix so it can be filtered out of a noisy
 * host-page console — a content script shares its console with whatever page it is
 * injected into, so unprefixed logging is hostile to whoever is debugging that page.
 *
 * There is deliberately no "dump this object" helper: details must be passed
 * explicitly, which keeps accidental payload logging visible in code review.
 */

/** Log categories from `docs/CONVENTIONS.md` §12. Adding one means adding it there too. */
export type LogTag = 'BUILD' | 'RUNTIME' | 'CAPABILITY' | 'HEALTH' | 'REPAIR' | 'SECURITY'

/** The same categories as a value, for tests and anything that must enumerate them. */
export const LOG_TAGS = ['BUILD', 'RUNTIME', 'CAPABILITY', 'HEALTH', 'REPAIR', 'SECURITY'] as const

export const LOG_PREFIX = '[JUXBLY]'

export interface Logger {
  info(message: string, ...details: readonly unknown[]): void
  warn(message: string, ...details: readonly unknown[]): void
  error(message: string, ...details: readonly unknown[]): void
}

/**
 * The structured form a capability logs through `RuntimePorts.log`
 * (`docs/ARCHITECTURE.md` §6.1). Capabilities never call `console` directly: a log line
 * has to be filterable out of the host page's console, and only the logger knows how.
 */
export interface LogEvent {
  tag: LogTag
  message: string
  details?: readonly unknown[]
}

/**
 * Never pass API keys, tokens, page content, or extracted user data as `details`
 * (`docs/CONVENTIONS.md` §12). Log the shape or the count, not the contents.
 */
export function createLogger(tag: LogTag): Logger {
  const prefix = `${LOG_PREFIX}[${tag}]`

  return {
    info: (message, ...details) => {
      console.info(prefix, message, ...details)
    },
    warn: (message, ...details) => {
      console.warn(prefix, message, ...details)
    },
    error: (message, ...details) => {
      console.error(prefix, message, ...details)
    },
  }
}
