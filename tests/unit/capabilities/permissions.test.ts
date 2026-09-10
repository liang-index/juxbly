import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { registerBuiltInCapabilities } from '@juxbly/capabilities'
import type { CapabilityPermission } from '@juxbly/core'
import { CapabilityRegistry } from '@juxbly/runtime'

/**
 * Permission completeness — `docs/ARCHITECTURE.md` §6.3, `task/stage-1-15.md` AC 8.
 *
 * The enum is the extension's whole attack surface in one line, which is exactly why it
 * needs a guard: a value with no producer is a permission nobody declares but everyone
 * assumes, and a value with no consumer is a capability the manifest grants for nothing.
 * Both are the kind of drift that shows up in a store review rather than in a test run.
 *
 * The last assertion pins the document rather than the code, because the enum is a
 * *decision* before it is a type — adding `geolocation` is not a one-line change, and a
 * test that checks §6.3 still lists what the code declares is the cheapest way to make
 * sure that conversation happens before the code lands.
 */
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))

/** The complete V1 list (`packages/core/src/capability.ts`, §6.3). */
const ALL_PERMISSIONS: readonly CapabilityPermission[] = [
  'dom.read',
  'clipboard.write',
  'downloads',
  'llm.call',
  'none',
]

function registeredCapabilities(): readonly {
  type: string
  permissions: readonly CapabilityPermission[]
  securityNotes: string
}[] {
  const registry = new CapabilityRegistry()
  registerBuiltInCapabilities(registry)
  return registry.list()
}

describe('capability permissions (§6.3)', () => {
  it('every permission has a producer — the built-ins cover the whole enum', () => {
    const declared = new Set(registeredCapabilities().flatMap((capability) => capability.permissions))

    for (const permission of ALL_PERMISSIONS) {
      expect([...declared], permission).toContain(permission)
    }
  })

  it('no capability declares a permission the enum does not define', () => {
    for (const capability of registeredCapabilities()) {
      for (const permission of capability.permissions) {
        expect(ALL_PERMISSIONS, `${capability.type} declares ${permission}`).toContain(permission)
      }
    }
  })

  it('every capability declares its permissions and its security notes (CONVENTIONS §5)', () => {
    for (const capability of registeredCapabilities()) {
      expect(capability.permissions.length, capability.type).toBeGreaterThan(0)
      expect(capability.securityNotes.trim(), capability.type).not.toBe('')
    }
  })

  it('§6.3 still lists the enum — a new permission is a document decision first', () => {
    const doc = readFileSync(join(REPO_ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8')
    const section = doc.slice(doc.indexOf('### 6.3'), doc.indexOf('### 6.4'))

    for (const permission of ALL_PERMISSIONS) {
      expect(section, permission).toContain(`'${permission}'`)
    }
  })
})
