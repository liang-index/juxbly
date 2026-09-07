/**
 * `RuntimePorts` assembly — `docs/ARCHITECTURE.md` §6.1.
 *
 * A capability reaches the world only through the ports it is handed, so the ports are
 * also the security boundary: what is not injected cannot be reached, and a missing port
 * must therefore fail loudly rather than fall back to something convenient.
 */
import type { DomPort, LlmPort, LogEvent, RuntimePorts } from '@juxbly/core'
import type { ClipboardPort, DownloadsPort } from '@juxbly/browser'

/** Every port is optional: a run that never renders needs no mount point. */
export interface RuntimePortOverrides {
  dom?: DomPort
  llm?: LlmPort
  clipboard?: ClipboardPort
  downloads?: DownloadsPort
  log?: (event: LogEvent) => void
}

/**
 * Builds a complete `RuntimePorts`.
 *
 * Ports that are not supplied become stubs that throw on use — the same discipline as the
 * capability tests: a capability that reaches a port it was not given is doing something
 * its permission list says it cannot do, and that has to be visible.
 */
export function createRuntimePorts(overrides: RuntimePortOverrides): RuntimePorts {
  return {
    dom: overrides.dom ?? stub<DomPort>('dom'),
    llm: overrides.llm ?? stub<LlmPort>('llm'),
    clipboard: overrides.clipboard ?? stub<ClipboardPort>('clipboard'),
    downloads: overrides.downloads ?? stub<DownloadsPort>('downloads'),
    log: overrides.log ?? (() => {}),
  }
}

function stub<T>(name: string): T {
  const message = `port "${name}" was not injected into this run`

  return new Proxy({} as object, {
    get() {
      return () => {
        throw new Error(message)
      }
    },
  }) as T
}
