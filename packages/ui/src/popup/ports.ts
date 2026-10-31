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
  /**
   * Stage 3-2 (the Policy Surface, §7.3): the page the enable affordance is about, or
   * `null` when there is nothing to ask for — no visible URL, a non-page URL, or an
   * origin that is already granted. The enable section of the popup renders only in the
   * last remaining case, so both build variants share one code path: in the open-source
   * build everything is granted and this returns `null` everywhere.
   */
  pageToEnable(): Promise<EnablePage | null>
  /** Ask the platform to grant the page's origin. `false` means declined. */
  requestSiteAccess(page: EnablePage): Promise<boolean>
}

/** A page whose origin the extension does not have yet — the enable section's subject. */
export interface EnablePage {
  /** The host as the user reads it, e.g. `books.toscrape.com`. */
  host: string
  /** The origin pattern the platform grants, e.g. `https://books.toscrape.com/*`. */
  originPattern: string
}

/** Reply codes the panel turns into copy. Stable and English (§7.2). */
export const NO_REPLY = 'NO_REPLY'

/**
 * The origin pattern a URL grants, or `null` when the URL is not a page: `chrome://`
 * pages, `file://` (unless the user flipped the extension's own file-access switch) and
 * anything unparsable are not origins a host permission can name.
 */
export function originPatternOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return `${parsed.origin}/*`
  } catch {
    return null
  }
}

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

    async pageToEnable(): Promise<EnablePage | null> {
      const reply = await adapter.messaging.send({ kind: 'tab:active_url' })
      if (reply === null || reply.kind !== 'tab:active_url_result' || reply.url === null) {
        return null
      }
      const originPattern = originPatternOf(reply.url)
      if (originPattern === null) return null
      if (await adapter.permissions.contains([originPattern])) return null
      return { host: new URL(reply.url).hostname, originPattern }
    },

    async requestSiteAccess(page: EnablePage): Promise<boolean> {
      return await adapter.permissions.request([page.originPattern])
    },
  }
}
