/**
 * The registration point 1-7 left open.
 *
 * The engine dispatches on `step.type` and never knows which capabilities exist, so "what
 * can a step be" is a registration question, not an engine question. Keeping the list
 * here — next to the implementations — means a new capability is one line in the package
 * that owns it, and nothing in `packages/runtime` changes (`export` arrives the same way
 * in 1-15).
 *
 * The sink is typed structurally on purpose: `packages/capabilities` does not depend on
 * `packages/runtime` (module map §4), and `register` is all this needs from it.
 */
import type { CapabilityDefinition } from '@juxbly/core'
import { exportCapability } from './export'
import { extractCapability } from './extract'
import { llmCapability } from './llm'
import { renderCapability } from './render'
import { transformCapability } from './transform'

export interface CapabilitySink {
  register(definition: CapabilityDefinition<unknown, unknown>): void
}

/** Order is irrelevant: the registry is keyed by `type`. */
export function registerBuiltInCapabilities(registry: CapabilitySink): void {
  registry.register(extractCapability)
  registry.register(transformCapability)
  registry.register(renderCapability)
  registry.register(llmCapability)
  registry.register(exportCapability)
}
