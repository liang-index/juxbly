/**
 * `CapabilityRegistry` — `docs/ARCHITECTURE.md` §6.2.
 *
 * The registry is the only way a step type reaches an implementation. That is the whole
 * point: the run engine (1-7) dispatches on `step.type` and never knows which capability
 * exists, so adding one is a registration, not an edit to the engine.
 *
 * Registering the same type twice throws. Overwriting would let two capabilities disagree
 * about what a step means, and the tool that runs would depend on registration order.
 */
import type { CapabilityDefinition } from '@juxbly/core'

type AnyCapability = CapabilityDefinition<unknown, unknown>

export class CapabilityRegistry {
  private readonly definitions = new Map<string, AnyCapability>()

  register(definition: AnyCapability): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`capability "${definition.type}" is already registered`)
    }
    this.definitions.set(definition.type, definition)
  }

  get(type: string): AnyCapability | undefined {
    return this.definitions.get(type)
  }

  list(): readonly AnyCapability[] {
    return [...this.definitions.values()]
  }
}
