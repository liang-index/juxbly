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

/** Covers content script injection on any page and the BYOK endpoint fetch. */
export const JUXBLY_HOST_PERMISSIONS: NonNullable<UserManifest['host_permissions']> = ['<all_urls>']

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
  permissions: JUXBLY_PERMISSIONS,
  host_permissions: JUXBLY_HOST_PERMISSIONS,
  commands: JUXBLY_COMMANDS,
}
