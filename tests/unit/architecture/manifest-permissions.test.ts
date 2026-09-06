import { describe, expect, it } from 'vitest'
import {
  JUXBLY_COMMANDS,
  JUXBLY_HOST_PERMISSIONS,
  JUXBLY_MANIFEST,
  JUXBLY_PERMISSIONS,
} from '../../../apps/extension/manifest'

/**
 * Permission snapshot — `docs/ARCHITECTURE.md` §7.3.
 *
 * The guard is about stopping a permission from being added quietly, and a permission
 * is added in the *declaration*, not in the build output. So this asserts the module
 * `wxt.config.ts` consumes rather than a generated `manifest.json`: no build step, and
 * CI does not have to grow one.
 *
 * Layout: `apps/extension/manifest.ts` exists for exactly this reason.
 */

/** `docs/ARCHITECTURE.md` §7.3, verbatim order. */
const DECLARED_PERMISSIONS = ['storage', 'activeTab', 'clipboardWrite', 'downloads']

/** §7.3: never requested — the URL comes from `activeTab`, and there is no injection. */
const FORBIDDEN_PERMISSIONS = ['tabs', 'scripting', 'webRequest', 'webRequestBlocking']

describe('manifest permissions (ARCHITECTURE.md §7.3)', () => {
  it('requests exactly the four declared permissions', () => {
    expect(JUXBLY_PERMISSIONS).toEqual(DECLARED_PERMISSIONS)
  })

  it('requests <all_urls> as the only host permission', () => {
    expect(JUXBLY_HOST_PERMISSIONS).toEqual(['<all_urls>'])
  })

  it('never requests tabs, scripting or webRequest', () => {
    for (const forbidden of FORBIDDEN_PERMISSIONS) {
      expect(JUXBLY_PERMISSIONS).not.toContain(forbidden)
    }
  })

  it('declares the Ctrl/Cmd+Shift+J command (UI_SPEC.md §8)', () => {
    expect(JUXBLY_COMMANDS).toEqual({
      'toggle-juxbly': {
        suggested_key: {
          default: 'Ctrl+Shift+J',
          mac: 'Cmd+Shift+J',
        },
        description: 'Show or hide Juxbly',
      },
    })
  })

  it('builds the manifest from the same declarations this test asserts', () => {
    // Without this, someone could stop using these constants and the four assertions
    // above would keep passing on values nothing consumes.
    expect(JUXBLY_MANIFEST.permissions).toBe(JUXBLY_PERMISSIONS)
    expect(JUXBLY_MANIFEST.host_permissions).toBe(JUXBLY_HOST_PERMISSIONS)
    expect(JUXBLY_MANIFEST.commands).toBe(JUXBLY_COMMANDS)
  })
})
