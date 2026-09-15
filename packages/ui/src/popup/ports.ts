/**
 * The popup's way out of itself — `docs/ARCHITECTURE.md` §7.2.
 *
 * The popup is an extension page, so it *could* read storage directly. It does not, for
 * the same reason the content script does not: `ToolOverviewItem` is assembled in the
 * background (`listToolOverviews`), and a second assembly of the same rows inside the
 * popup would be a second definition of "what a row is" — the exact drift the message
 * boundary exists to prevent.
 *
 * `tab:open` is the one call that has to go out anyway: choosing a tab is a platform
 * action, and the assembly layer is the only place allowed to make one (§6.4.1).
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { ToolOverviewItem } from '@juxbly/core'

export interface OverviewPorts {
  listTools(): Promise<ToolOverviewItem[]>
  /** `false` means no tab was opened — the panel says so instead of pretending. */
  openTab(url: string): Promise<boolean>
}

/** Reply codes the panel turns into copy. Stable and English (§7.2). */
export const NO_REPLY = 'NO_REPLY'

export function createOverviewPorts(adapter: BrowserAdapter): OverviewPorts {
  return {
    async listTools(): Promise<ToolOverviewItem[]> {
      const reply = await adapter.messaging.send({ kind: 'tool:list' })
      if (reply === null || reply.kind !== 'tool:list_result') return []
      return reply.tools ?? []
    },

    async openTab(url: string): Promise<boolean> {
      const reply = await adapter.messaging.send({ kind: 'tab:open', url })
      if (reply === null || reply.kind !== 'tab:open_result') return false
      return reply.ok === true
    },
  }
}
