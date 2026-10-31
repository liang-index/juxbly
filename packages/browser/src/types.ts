/**
 * `BrowserAdapter` and the ports it is assembled from — `docs/ARCHITECTURE.md` §5.5
 * (the adapter) and §6.1 (the port shapes), transcribed. Those sections are the single
 * authoritative definition: this file adds no method, renames nothing and widens no
 * signature.
 *
 * Why the ports live in this package rather than in `packages/core`: they describe
 * **platform** abilities, and this package is the only one allowed to name the platform
 * (`docs/ARCHITECTURE.md` §6.4). Runtime and capabilities depend on these interfaces,
 * never on an implementation — that is what lets the mock stand in for chrome in every
 * test.
 *
 * Division of labour (§6.1): `BrowserAdapter` is the low-level abstraction;
 * `RuntimePorts` is the facade injected into capabilities. Neither imports the other's
 * implementation.
 */
import type { ExtensionMessage } from '@juxbly/core'

/**
 * The storage surface. Permission: `storage` (`docs/ARCHITECTURE.md` §7.3).
 *
 * Missing keys read as `null` in **both** implementations: a storage read that throws
 * for "not set yet" would turn every first run into an error path.
 */
export interface StoragePort {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  /** Data-migration hook, called on a schema version upgrade. */
  migrate?(fromVersion: number): Promise<void>
}

/**
 * Permission: `clipboardWrite`. The port exists because `Copy` must never run silently
 * under program control (`docs/UI_SPEC.md` §7.3) — having exactly one place that writes
 * to the clipboard is what makes that auditable.
 */
export interface ClipboardPort {
  writeText(text: string): Promise<void>
}

/**
 * Permission: `downloads`. Executed on the background side: `chrome.downloads` does not
 * exist in a content script, and this port is how the content script asks for a file
 * without ever seeing the API.
 */
export interface DownloadsPort {
  download(filename: string, content: string, mime: string): Promise<void>
}

/**
 * The content ↔ background channel, carrying every §7.2 message type.
 *
 * `captureTab` exists for the A3 visual fallback (`docs/ARCHITECTURE.md` §9.1): a
 * screenshot is attached only after the DOM route has failed, because page pixels then
 * leave the machine for the user's own model endpoint.
 */
export interface MessagingPort {
  send<T extends ExtensionMessage>(message: ExtensionMessage): Promise<T | null>
  /**
   * Subscribe to messages pushed **into** this context (background → content script,
   * e.g. the shortcut relay). Chrome delivers a `tabs.sendMessage` to every listener in
   * the tab; the listener receives `unknown` — messages cross a trust boundary.
   *
   * Returns an unsubscribe function. Stage 1-8; the request/response `send` above does
   * not cover this direction.
   */
  onMessage(listener: (message: unknown) => void): () => void
  captureTab(): Promise<string>
}

/**
 * Runtime host permissions — `docs/ARCHITECTURE.md` §7.3, the Policy Surface (stage 3-2).
 *
 * The Store Build declares no broad static host permission. Instead a page's origin is
 * granted when the user acts — the popup's "enable on this page", a preset install, a
 * custom AI endpoint saved in settings — and this port is how those grants are asked
 * for. Both methods take explicit origin patterns (`https://host/*`), never a page URL:
 * the pattern is the unit the platform grants, and the UI derives it from a URL it
 * already shows.
 *
 * `request` must run during a user gesture in an extension page; content scripts cannot
 * call it at all. That constraint is why the port has exactly two methods and no
 * `remove`: this is the one auditable place that asks for host access, and revocation is
 * the browser's own settings UI, not a product surface.
 */
export interface PermissionsPort {
  /** Whether **every** one of the origin patterns is already granted. */
  contains(origins: readonly string[]): Promise<boolean>
  /**
   * Ask the platform to grant the origin patterns (the browser shows its own prompt).
   * `false` means the user — or the platform — said no; the UI says so rather than
   * pretending the grant happened.
   */
  request(origins: readonly string[]): Promise<boolean>
}

/**
 * The confirmed minimal set (`docs/ARCHITECTURE.md` §6.4): storage, clipboard,
 * downloads, messaging and permissions.
 *
 * Deliberately absent: anything `tabs`-shaped. `tabs` is never requested (§7.3) — the
 * URL arrives through `activeTab` and the existing message flow — and DOM reading is
 * not an adapter concern at all (it is injected as `RuntimePorts.dom`, §6.1).
 */
export interface BrowserAdapter {
  storage: StoragePort
  clipboard: ClipboardPort
  downloads: DownloadsPort
  messaging: MessagingPort
  permissions: PermissionsPort
}
