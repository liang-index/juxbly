import { copy } from '@juxbly/ui/copy'
import type { UserManifest } from 'wxt'

/**
 * Extension manifest declaration source (stage 0-3).
 *
 * This lives outside `wxt.config.ts` so the permission snapshot test can assert the
 * *declaration* rather than the build artefact. The guard exists to stop a permission
 * from being added quietly, and a declaration — not an output file — is where a
 * permission gets added. It also keeps the test free of a build step, so CI stays fast.
 *
 * Permissions are fixed by `docs/ARCHITECTURE.md` §7.3. Changing any of them means
 * changing that section first and stating why.
 *
 * Deliberately absent: `tabs`, `scripting`, `webRequest`. The URL comes from
 * `activeTab` plus the existing message flow; there is no programmatic injection.
 */

export const JUXBLY_PERMISSIONS: NonNullable<UserManifest['permissions']> = [
  'storage',
  'activeTab',
  'clipboardWrite',
  'downloads',
]

/**
 * The one place the build number is written (stage 1-16).
 *
 * The settings page shows it so a bug report can name a build, which only works if the
 * badge and the manifest cannot disagree. Reading it back from the platform at runtime
 * would put a platform call in the UI layer; declaring it here and letting both the
 * manifest and the page read the same constant keeps the boundary intact (§6.4).
 *
 * Bump it when a version ships — it is the user-visible version, not a package number.
 */
export const JUXBLY_VERSION = '0.1.0'

/**
 * The build variant — stage 3-2, `docs/ARCHITECTURE.md` §7.3 (the Policy Surface).
 *
 * - **`oss`** (the default, and what `pnpm dev` / `pnpm build` produce): the open-source
 *   build declares `<all_urls>` statically, because "a tool appears on the page it
 *   matches" requires content-script injection on arbitrary pages and this build is
 *   developer-distributed. This is the surface PRIVACY.md documents.
 * - **`store`**: `pnpm build:store` produces the CWS build. It narrows the host surface
 *   through the Policy Surface — one static origin (the default AI provider, the origin a
 *   bare-key first run actually calls) and `<all_urls>` as *optional*, granted on demand
 *   when the user acts (the popup's "enable on this page", a preset install, a custom
 *   endpoint saved in settings). Same core, narrower surface; neither build ever requests
 *   `tabs` / `scripting` / `webRequest`.
 *
 * The variant is a build-time env switch (`JUXBLY_VARIANT=store pnpm build:store`) rather
 * than a runtime flag on purpose: a manifest permission is not a preference, and a build
 * that could flip its own surface at runtime would be a surface nobody could audit.
 */
export type JuxblyBuildVariant = 'oss' | 'store'

export const JUXBLY_VARIANT: JuxblyBuildVariant =
  process.env.JUXBLY_VARIANT === 'store' ? 'store' : 'oss'

/** The open-source build's static host surface, unchanged since stage 0-3. */
export const JUXBLY_HOST_PERMISSIONS: NonNullable<UserManifest['host_permissions']> = [
  '<all_urls>',
]

/**
 * The store build's one static host: the default AI provider (`DEFAULT_API_BASE_URL` in
 * `packages/llm/src/client.ts` is the paired constant — the manifest test asserts the two
 * agree). A first run that saves only a key calls this origin and nothing else.
 */
export const JUXBLY_STORE_STATIC_HOSTS: NonNullable<UserManifest['host_permissions']> = [
  'https://api.openai.com/*',
]

/** The store build's optional surface: every other origin is a user action away. */
export const JUXBLY_OPTIONAL_HOST_PERMISSIONS: NonNullable<
  UserManifest['optional_host_permissions']
> = ['<all_urls>']

export interface ResolvedHostPermissions {
  host_permissions: NonNullable<UserManifest['host_permissions']>
  optional_host_permissions?: NonNullable<UserManifest['optional_host_permissions']>
}

export function resolveHostPermissions(variant: JuxblyBuildVariant): ResolvedHostPermissions {
  if (variant === 'store') {
    return {
      host_permissions: JUXBLY_STORE_STATIC_HOSTS,
      optional_host_permissions: JUXBLY_OPTIONAL_HOST_PERMISSIONS,
    }
  }
  return { host_permissions: JUXBLY_HOST_PERMISSIONS }
}

/**
 * `Ctrl/Cmd+Shift+Y` — `docs/UI_SPEC.md` §8. Stage 0-3 declares the command and lands
 * the receiving skeleton only; what the command actually does arrives in 1-8.
 *
 * Why `Y` and not `J`: a `suggested_key` is only a suggestion — Chrome assigns it unless
 * it collides with one of its own, and `Ctrl/Cmd+Shift+J` does (open the console), so
 * Chrome silently assigned **nothing** and the command was unreachable (measured in 1-8:
 * the `commands` API reported `shortcut: ""` for `toggle-juxbly`). `Ctrl+Shift+Y`
 * / `Command+Shift+Y` is assigned on load. Whatever ships here stays a *suggestion* the
 * user can override in the browser's shortcut settings, so no copy may state the key as
 * a fact — read it back from the `commands` API when it has to be shown.
 *
 * The Mac value is spelled `Command`, not `Cmd`: Chrome accepts only `Command` and
 * `MacCtrl` as Mac modifiers and rejects the manifest outright on anything else
 * ("Invalid value for 'commands[...].mac'"). `Cmd` and `Ctrl`/`Cmd` are how humans and
 * the docs write the shortcut; the literal in the manifest has to be Chrome's spelling.
 */
export const JUXBLY_COMMANDS: NonNullable<UserManifest['commands']> = {
  'toggle-juxbly': {
    suggested_key: {
      default: 'Ctrl+Shift+Y',
      mac: 'Command+Shift+Y',
    },
    description: copy.command.toggleJuxbly,
  },
}

export const JUXBLY_MANIFEST: UserManifest = {
  // Without these, WXT falls back to the workspace package name and ships an extension
  // called "@juxbly/extension".
  name: copy.extension.name,
  description: copy.extension.description,
  version: JUXBLY_VERSION,
  permissions: JUXBLY_PERMISSIONS,
  ...resolveHostPermissions(JUXBLY_VARIANT),
  commands: JUXBLY_COMMANDS,
  // Icons live in apps/extension/public/; WXT copies them to the build root.
  // The source icon.png (2048x2048) is the master; the resized sizes are
  // committed alongside so the manifest can point at exact pixel sizes.
  icons: {
    '16': 'icon-16.png',
    '32': 'icon-32.png',
    '48': 'icon-48.png',
    '96': 'icon-96.png',
    '128': 'icon-128.png',
  },
  action: {
    default_title: copy.extension.name,
    default_popup: 'popup.html',
    default_icon: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
    },
  },
}
