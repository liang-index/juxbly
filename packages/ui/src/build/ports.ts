/**
 * The build panel's way out of the page — `docs/ARCHITECTURE.md` §7.2.
 *
 * The panel lives in a content script: it has no key, no endpoint, and no business
 * being near either. Everything the build flow needs from the background goes through
 * these three calls, and the mapping from "a message came back" to "what happened" lives
 * here rather than in the session, so the session stays a pure state machine a node test
 * can drive without messaging at all.
 *
 * Messages cross a trust boundary: a reply is `unknown` until its `kind` says otherwise,
 * and an unexpected reply is a failure, never a cast.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { RepairSaveRequest } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import type { ProposeReply, ProposeRequest, SaveResult } from './build-session'

export interface MessagingPorts {
  propose(request: ProposeRequest): Promise<ProposeReply>
  captureScreenshot(): Promise<string>
  /**
   * `repair` (stage 1-12) turns the write into **a new version of an existing tool**
   * (§9.3) instead of a first save. It is bound once, when the panel is mounted for a
   * repair, so no component — and no later call — can accidentally save a repair as a new
   * tool or a new tool as a version.
   */
  save(tool: ToolDefinition): Promise<SaveResult>
}

/** Reply codes the panel turns into copy. Stable and English (§5.5 / UI_SPEC §9.5). */
export const NO_REPLY = 'NO_REPLY'
export const EMPTY_REPLY = 'EMPTY_REPLY'

export function createMessagingPorts(
  adapter: BrowserAdapter,
  repair?: RepairSaveRequest,
): MessagingPorts {
  return {
    async propose(request: ProposeRequest): Promise<ProposeReply> {
      const reply = await adapter.messaging.send({
        kind: 'build:propose',
        requestId: createRequestId(),
        conversation: [...request.conversation],
        pageAnalysis: request.pageAnalysis,
        conservative: request.conservative,
        noMoreQuestions: request.noMoreQuestions,
        // A3: attached only after the DOM route has already failed (§7.2).
        ...(request.screenshot === undefined ? {} : { screenshot: request.screenshot }),
      })

      if (reply === null || reply.kind !== 'build:propose_result') {
        return { kind: 'failed', error: NO_REPLY }
      }
      if (!reply.ok) return { kind: 'failed', error: reply.error ?? NO_REPLY }

      const candidates = reply.candidates ?? []
      if (candidates.length > 0) {
        return {
          kind: 'candidates',
          candidates,
          ...(reply.usage === undefined ? {} : { usage: reply.usage }),
        }
      }
      // Backward compatible: a model that returns one tool instead of candidates (§7.2).
      if (reply.tool !== undefined) {
        return {
          kind: 'candidates',
          candidates: [reply.tool],
          ...(reply.usage === undefined ? {} : { usage: reply.usage }),
        }
      }
      if (reply.reply !== undefined) {
        return {
          kind: 'clarify',
          content: reply.reply.content,
          ...(reply.usage === undefined ? {} : { usage: reply.usage }),
        }
      }

      return { kind: 'failed', error: EMPTY_REPLY }
    },

    // Screenshots are taken on the background side (§7.2): the content script asks.
    captureScreenshot(): Promise<string> {
      return adapter.messaging.captureTab()
    },

    async save(tool: ToolDefinition): Promise<SaveResult> {
      const reply = await adapter.messaging.send({
        kind: 'build:save_tool',
        tool,
        ...(repair === undefined ? {} : { repair }),
      })

      if (reply === null || reply.kind !== 'build:save_tool_result') {
        return { ok: false, error: NO_REPLY }
      }
      if (reply.ok) return { ok: true }

      return { ok: false, ...(reply.error === undefined ? {} : { error: reply.error }) }
    },
  }
}

/**
 * Several proposes can be in flight across panels and tabs; the id is echoed back so a
 * late reply can never land on the wrong conversation.
 */
export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `build-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
