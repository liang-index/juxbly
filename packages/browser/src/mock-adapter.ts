/**
 * The in-memory `BrowserAdapter`: every test, plus `apps/playground`.
 *
 * The mock exists so that "it works in tests" means something. That only holds if it
 * behaves like the chrome implementation **including the error semantics** — a mock that
 * throws where chrome returns `null` (or the other way round) makes tests pass and the
 * extension fail. `tests/unit/browser/adapter-implementations.test.ts` runs one suite
 * against both to keep them honest.
 */
import type { ExtensionMessage } from '@juxbly/core'
import type { BrowserAdapter } from './types'

export interface MockCall {
  /** Dotted port + method, e.g. "storage.set" — the form an assertion reads naturally. */
  method: string
  args: readonly unknown[]
}

export interface MockAdapterOptions {
  /** Pre-seeded storage, keyed exactly as `docs/ARCHITECTURE.md` §8.1 keys it. */
  storage?: Readonly<Record<string, unknown>>
  /** Reply for `messaging.send`; receives the outgoing message. */
  onSend?: (message: ExtensionMessage) => unknown
  /** Reply for `messaging.captureTab`; tests use a short data URL. */
  screenshot?: string
}

export interface MockAdapter extends BrowserAdapter {
  /** Every port call, in order. Tests assert "this write happened" / "it did not". */
  readonly calls: readonly MockCall[]
  /** Current storage contents, for assertions that do not want to go through `get`. */
  readonly data: ReadonlyMap<string, unknown>
  /** Deliver a pushed message to every current `messaging.onMessage` listener. */
  emitIncoming(message: unknown): void
}

export function createMockAdapter(options: MockAdapterOptions = {}): MockAdapter {
  const data = new Map<string, unknown>(Object.entries(options.storage ?? {}))
  const calls: MockCall[] = []
  const incoming: Array<(message: unknown) => void> = []

  const record = (method: string, ...args: readonly unknown[]): void => {
    calls.push({ method, args })
  }

  return {
    calls,
    data,

    emitIncoming(message: unknown): void {
      for (const listener of [...incoming]) listener(message)
    },

    storage: {
      async get<T>(key: string): Promise<T | null> {
        record('storage.get', key)
        return (data.get(key) as T | undefined) ?? null
      },

      async set<T>(key: string, value: T): Promise<void> {
        record('storage.set', key, value)
        data.set(key, value)
      },

      async remove(key: string): Promise<void> {
        record('storage.remove', key)
        data.delete(key)
      },
    },

    clipboard: {
      async writeText(text: string): Promise<void> {
        record('clipboard.writeText', text)
      },
    },

    downloads: {
      async download(filename: string, content: string, mime: string): Promise<void> {
        record('downloads.download', filename, content, mime)
      },
    },

    messaging: {
      async send<T extends ExtensionMessage>(message: ExtensionMessage): Promise<T | null> {
        record('messaging.send', message)
        const reply = options.onSend?.(message)
        return (reply as T | null | undefined) ?? null
      },

      onMessage(listener: (message: unknown) => void): () => void {
        record('messaging.onMessage')
        incoming.push(listener)
        return () => {
          const index = incoming.indexOf(listener)
          if (index >= 0) incoming.splice(index, 1)
        }
      },

      async captureTab(): Promise<string> {
        record('messaging.captureTab')
        return options.screenshot ?? ''
      },
    },
  }
}
