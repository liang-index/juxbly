import { describe, expect, it } from 'vitest'
import type { CapabilityDefinition } from '@juxbly/core'
import {
  extractCapability,
  llmCapability,
  renderCapability,
  transformCapability,
} from '@juxbly/capabilities'
import { CapabilityRegistry } from '@juxbly/runtime'

/**
 * The registry as shipped (stage 1-7, AC 1): four real capabilities and one registration
 * point left open for `export` (1-15).
 *
 * The placeholder below is deliberately minimal — it only has to prove that a fifth
 * capability can be added without touching the registry or the engine. That is the whole
 * reason a registry exists instead of a switch statement.
 */
const exportPlaceholder: CapabilityDefinition<unknown, unknown> = {
  type: 'export',
  version: '0.0.0',
  inputSchema: {},
  outputSchema: {},
  permissions: ['clipboard.write', 'downloads'],
  securityNotes: 'placeholder: registered by stage 1-15, not by 1-7',
  execute: async () => ({ ok: true }),
}

describe('the capability registry as 1-7 ships it', () => {
  it('holds the four capabilities V1 can execute today', () => {
    const registry = new CapabilityRegistry()
    registry.register(extractCapability)
    registry.register(transformCapability)
    registry.register(llmCapability)
    registry.register(renderCapability)

    expect(registry.list().map((capability) => capability.type).sort()).toEqual([
      'extract',
      'llm',
      'render',
      'transform',
    ])
  })

  it('leaves a registration point open for export', () => {
    const registry = new CapabilityRegistry()
    registry.register(extractCapability)
    registry.register(transformCapability)
    registry.register(llmCapability)
    registry.register(renderCapability)

    // 1-15 registers the real one here; nothing else has to change.
    expect(() => registry.register(exportPlaceholder)).not.toThrow()
    expect(registry.get('export')?.type).toBe('export')
    expect(registry.list()).toHaveLength(5)
  })

  it('answers undefined for a type it does not have', () => {
    const registry = new CapabilityRegistry()
    registry.register(transformCapability)

    expect(registry.get('export')).toBeUndefined()
  })

  it('declares permissions and security notes for every registered capability', () => {
    const registry = new CapabilityRegistry()
    registry.register(extractCapability)
    registry.register(transformCapability)
    registry.register(llmCapability)
    registry.register(renderCapability)
    registry.register(exportPlaceholder)

    // CONVENTIONS §5: a capability without these is not reviewable, so the fence is here.
    for (const capability of registry.list()) {
      expect(capability.permissions.length).toBeGreaterThan(0)
      expect(capability.securityNotes.length).toBeGreaterThan(0)
      expect(capability.version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})
