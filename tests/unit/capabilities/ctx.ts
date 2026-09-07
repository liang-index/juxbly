import type { ExecutionContext } from '@juxbly/core'

/**
 * Minimal `ExecutionContext` for capability tests.
 *
 * Every port starts as a stub that fails loudly if it is actually used — a capability that
 * reached for the DOM or the model in a transform test would be doing something the
 * permission list says it cannot do, and the test must surface that, not absorb it.
 */
export function ctxStub(): ExecutionContext {
  return {
    tabId: 1,
    signal: new AbortController().signal,
    ports: {
      dom: {
        query: () => {
          throw new Error('ctxStub: dom.port must not be used by this test')
        },
        mountPoint: () => {
          throw new Error('ctxStub: dom.port must not be used by this test')
        },
        scrollToBottom: async () => {
          throw new Error('ctxStub: dom.port must not be used by this test')
        },
      },
      llm: {
        call: async () => {
          throw new Error('ctxStub: llm.port must not be used by this test')
        },
      },
      clipboard: {
        writeText: async () => {
          throw new Error('ctxStub: clipboard.port must not be used by this test')
        },
      },
      downloads: {
        download: async () => {
          throw new Error('ctxStub: downloads.port must not be used by this test')
        },
      },
      log: () => {},
    },
  }
}

/** A ctx whose log calls are recorded, for "shape only, never values" assertions. */
export function ctxWithLog(): { ctx: ExecutionContext; logged: string[][] } {
  const logged: string[][] = []
  const ctx = ctxStub()
  ctx.ports.log = (event) => {
    logged.push([event.tag, event.message, ...(event.details ?? []).map((detail) => String(detail))])
  }
  return { ctx, logged }
}
