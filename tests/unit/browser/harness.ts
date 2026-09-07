import type { BrowserAdapter, ChromeNamespace, MockCall } from '@juxbly/browser'
import { createChromeAdapter, createMockAdapter } from '@juxbly/browser'
import type { ExtensionMessage } from '@juxbly/core'

/**
 * One harness shape for both `BrowserAdapter` implementations.
 *
 * The point of stage 1-3's mock is that a test passing against it says something about
 * the extension. That only holds while the two implementations agree, so both are driven
 * through the same suite in `adapter-implementations.test.ts`, observed through the same
 * harness. Where the platforms differ — the chrome implementation goes through a blob
 * URL, the mock hands the string straight over — the harness absorbs the difference so
 * the assertions do not have to.
 */

export const SCREENSHOT = 'data:image/png;base64,anV4Ymx5'

export interface DownloadCapture {
  filename: string | null
  /** Resolved lazily: the chrome path stores content in a Blob. */
  content: string | Promise<string> | null
}

export interface Harness {
  adapter: BrowserAdapter
  readonly clipboard: readonly string[]
  readonly downloads: readonly DownloadCapture[]
}

type GlobalName = 'chrome' | 'navigator'

const installed = new Set<GlobalName>()

function define(name: GlobalName, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  installed.add(name)
}

/** Restores whatever the harness installed; safe to call when nothing was. */
export function restoreGlobals(): void {
  for (const name of installed) {
    Reflect.deleteProperty(globalThis, name)
  }
  installed.clear()
  URL.createObjectURL = nativeCreateObjectURL
}

const nativeCreateObjectURL = URL.createObjectURL.bind(URL)

/** Replies the way `entrypoints/background.ts` does today: ping gets a pong, nothing else. */
function replyTo(message: ExtensionMessage): unknown {
  return message.kind === 'internal:ping' ? { kind: 'internal:pong', ok: true } : null
}

export function chromeHarness(): Harness {
  const clipboard: string[] = []
  const downloads: DownloadCapture[] = []
  const data = new Map<string, unknown>()
  let pendingBlob: Blob | null = null

  URL.createObjectURL = (object: Blob | MediaSource): string => {
    if (object instanceof Blob) pendingBlob = object
    return nativeCreateObjectURL(object)
  }

  const platform: ChromeNamespace = {
    storage: {
      local: {
        async get(keys: string | readonly string[] | null): Promise<Record<string, unknown>> {
          if (keys === null) return Object.fromEntries(data)
          const wanted = typeof keys === 'string' ? [keys] : keys
          const found: Record<string, unknown> = {}
          for (const key of wanted) {
            const value = data.get(key)
            if (value !== undefined) found[key] = value
          }
          return found
        },
        async set(items: Record<string, unknown>): Promise<void> {
          for (const [key, value] of Object.entries(items)) data.set(key, value)
        },
        async remove(keys: string | readonly string[]): Promise<void> {
          for (const key of typeof keys === 'string' ? [keys] : keys) data.delete(key)
        },
      },
    },
    runtime: {
      async sendMessage(message: unknown): Promise<unknown> {
        return replyTo(message as ExtensionMessage)
      },
    },
    downloads: {
      async download(options: { url: string; filename?: string }): Promise<number> {
        downloads.push({
          filename: options.filename ?? null,
          content: pendingBlob === null ? null : pendingBlob.text(),
        })
        pendingBlob = null
        return 1
      },
    },
    tabs: {
      async captureVisibleTab(): Promise<string> {
        return SCREENSHOT
      },
    },
  }

  define('chrome', platform)
  define('navigator', { clipboard: { writeText: async (text: string): Promise<void> => {
    clipboard.push(text)
  } } })

  return {
    adapter: createChromeAdapter(),
    get clipboard(): readonly string[] {
      return clipboard
    },
    get downloads(): readonly DownloadCapture[] {
      return downloads
    },
  }
}

export function mockHarness(): Harness {
  const adapter = createMockAdapter({ onSend: replyTo, screenshot: SCREENSHOT })

  const argsOf = (method: string): readonly (readonly unknown[])[] =>
    adapter.calls.filter((call: MockCall) => call.method === method).map((call) => call.args)

  return {
    adapter,
    get clipboard(): readonly string[] {
      return argsOf('clipboard.writeText').map((args) => String(args[0]))
    },
    get downloads(): readonly DownloadCapture[] {
      // Wrapped in a promise so both harnesses expose the same shape: the chrome path can
      // only read the content back out of a Blob, asynchronously.
      return argsOf('downloads.download').map((args) => ({
        filename: String(args[0]),
        content: Promise.resolve(String(args[1])),
      }))
    },
  }
}
