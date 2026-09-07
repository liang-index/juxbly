import { describe, expect, it } from 'vitest'
import type { CapabilityDefinition } from '@juxbly/core'
import type { ToolStep } from '@juxbly/dsl'
import { CapabilityRegistry } from '@juxbly/runtime'

/**
 * `CapabilityRegistry` — §6.2. The seam the run engine (1-7) dispatches on: it must never
 * know which capabilities exist, only that a type resolves to exactly one.
 */
function definition(type: ToolStep['type']): CapabilityDefinition<unknown, unknown> {
  return {
    type,
    version: '1.0.0',
    inputSchema: {},
    outputSchema: {},
    permissions: ['none'],
    securityNotes: 'test stub',
    execute: async () => null,
  }
}

describe('CapabilityRegistry', () => {
  it('registers, resolves and lists capabilities', () => {
    const registry = new CapabilityRegistry()
    registry.register(definition('transform'))
    registry.register(definition('render'))

    expect(registry.get('transform')?.version).toBe('1.0.0')
    expect(registry.get('unknown')).toBeUndefined()
    expect(registry.list().map((entry) => entry.type).sort()).toEqual(['render', 'transform'])
  })

  it('refuses to register the same type twice', () => {
    const registry = new CapabilityRegistry()
    registry.register(definition('transform'))

    // Overwriting would let two implementations disagree about what a step means, and
    // which one wins would depend on registration order.
    expect(() => registry.register(definition('transform'))).toThrow(/already registered/)
  })
})
