/**
 * The chrome implementation of `BrowserAdapter` — the only file in the repository that
 * may name `chrome.*` (`docs/ARCHITECTURE.md` §6.4).
 *
 * Two rules shape everything below:
 *
 * 1. **The global is read at call time, never at import time.** A test environment has
 *    no `chrome`, and an MV3 service worker is torn down and recreated without warning,
 *    so the adapter stays stateless and looks the platform up on every call.
 * 2. **No business logic.** This file translates an abstract call into a platform call
 *    and nothing else: deciding *when* to save or *what* to save belongs to
 *    `packages/*`.
 */
import type { ExtensionMessage } from '@juxbly/core'
import type { BrowserAdapter } from './types'

/**
 * The structural type of the platform APIs this file touches.
 *
 * It is declared here instead of pulling in a global `chrome` type declaration because
 * this package is the only place allowed to name these APIs, and a structural
 * declaration keeps the claimed surface exactly as wide as the code that uses it. Adding
 * a call here means checking `docs/ARCHITECTURE.md` §7.3 first: any API that needs a new
 * permission is a manifest change, not an adapter detail.
 */
export interface ChromeNamespace {
  storage: {
    local: {
      get(keys: string | readonly string[] | null): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | readonly string[]): Promise<void>
    }
  }
  runtime: {
    sendMessage(message: unknown): Promise<unknown>
    onMessage: {
      addListener(listener: (message: unknown) => void): void
      removeListener(listener: (message: unknown) => void): void
    }
  }
  downloads: {
    download(options: ChromeDownloadOptions): Promise<number>
  }
  tabs: {
    captureVisibleTab(windowId: number | null, options: { format: 'png' | 'jpeg' }): Promise<string>
  }
}

export interface ChromeDownloadOptions {
  url: string
  filename?: string
  saveAs?: boolean
}

/**
 * Why this throws instead of returning a degraded adapter: a silent no-op adapter would
 * make a missing platform look like "saved successfully", and the failure would surface
 * much later as lost tools.
 */
function chromeOrThrow(): ChromeNamespace {
  const platform = (globalThis as { chrome?: ChromeNamespace }).chrome
  if (platform === undefined) {
    throw new Error('[JUXBLY][SECURITY] chrome.* is unavailable in this context')
  }
  return platform
}

export function createChromeAdapter(): BrowserAdapter {
  return {
    storage: {
      async get<T>(key: string): Promise<T | null> {
        const stored = await chromeOrThrow().storage.local.get(key)
        return (stored[key] as T | undefined) ?? null
      },

      async set<T>(key: string, value: T): Promise<void> {
        await chromeOrThrow().storage.local.set({ [key]: value })
      },

      async remove(key: string): Promise<void> {
        await chromeOrThrow().storage.local.remove(key)
      },
    },

    clipboard: {
      async writeText(text: string): Promise<void> {
        // The clipboard is a Web API, not a chrome.* one: what the extension needs is
        // the `clipboardWrite` permission (§7.3) to be allowed to use it. Read lazily for
        // the same reason as the platform namespace above.
        const clipboard = (
          globalThis as { navigator?: { clipboard?: { writeText(value: string): Promise<void> } } }
        ).navigator?.clipboard

        if (clipboard === undefined) {
          throw new Error('[JUXBLY][SECURITY] clipboard API is unavailable in this context')
        }
        await clipboard.writeText(text)
      },
    },

    downloads: {
      async download(filename: string, content: string, mime: string): Promise<void> {
        // A download takes a URL, so the content becomes a blob. Revoking in `finally`
        // keeps a failed download from pinning the content in memory until reload.
        const url = URL.createObjectURL(new Blob([content], { type: mime }))
        try {
          await chromeOrThrow().downloads.download({ url, filename, saveAs: false })
        } finally {
          URL.revokeObjectURL(url)
        }
      },
    },

    messaging: {
      async send<T extends ExtensionMessage>(message: ExtensionMessage): Promise<T | null> {
        const response = await chromeOrThrow().runtime.sendMessage(message)
        return (response as T | null | undefined) ?? null
      },

      onMessage(listener: (message: unknown) => void): () => void {
        const platform = chromeOrThrow()
        platform.runtime.onMessage.addListener(listener)
        return () => {
          platform.runtime.onMessage.removeListener(listener)
        }
      },

      async captureTab(): Promise<string> {
        return await chromeOrThrow().tabs.captureVisibleTab(null, { format: 'png' })
      },
    },
  }
}
