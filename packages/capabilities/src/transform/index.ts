/**
 * The `transform` capability — `docs/ARCHITECTURE.md` §5.2 / §6.1.
 *
 * One capability, four ops: the DSL has no control flow on purpose (§1 principle 3), so
 * "a new op" is a new enum value here, never a new way to express logic.
 *
 * Two invariants:
 *
 * - **Local and deterministic.** No model, no network, no storage, no DOM. The same input
 *    produces the same output, which is what makes the Phase 2 benchmark comparable.
 * - **Validated again here.** `validateToolDefinition` already checked the step before save
 *    and before every run (§5.4); this is the third point on the same fence, because a
 *    capability is also callable directly by a contributor's test.
 */
import type { CapabilityDefinition, CapabilityInput } from '@juxbly/core'
import type { TransformStep } from '@juxbly/dsl'
import { CapabilityError } from '../errors'
import { dedupeItems } from './dedupe'
import { filterItems } from './filter'
import { regexItems } from './regex'
import { sortItems } from './sort'

export type TransformOutput = readonly unknown[]

export { dedupeItems } from './dedupe'
export { filterItems, matchesCondition } from './filter'
export { regexItems } from './regex'
export { sortItems } from './sort'

export function runTransform(input: CapabilityInput<TransformStep>): TransformOutput {
  const { step, items } = input

  if (!Array.isArray(items)) {
    throw new CapabilityError(
      'INPUT_NOT_ARRAY',
      `transform expected an array of records, got ${typeof items}`,
    )
  }

  switch (step.op) {
    case 'filter': {
      // Completeness first: every op-specific parameter is checked before any record is
      // touched, so a malformed step fails the same way regardless of the data.
      if (step.condition === undefined) {
        throw new CapabilityError('TRANSFORM_CONDITION_REQUIRED', 'filter requires a condition')
      }
      return filterItems(items, step.condition)
    }

    case 'sort': {
      if (typeof step.field !== 'string' || step.field === '') {
        throw new CapabilityError('TRANSFORM_FIELD_REQUIRED', 'sort requires a target field')
      }
      if (step.order === undefined) {
        throw new CapabilityError('TRANSFORM_ORDER_REQUIRED', 'sort requires order "asc" or "desc"')
      }
      return sortItems(items, step.field, step.order)
    }

    case 'regex': {
      if (typeof step.field !== 'string' || step.field === '') {
        throw new CapabilityError('TRANSFORM_FIELD_REQUIRED', 'regex requires a target field')
      }
      if (typeof step.pattern !== 'string' || step.pattern === '') {
        throw new CapabilityError('TRANSFORM_PATTERN_REQUIRED', 'regex requires a pattern')
      }
      return regexItems(items, step.field, step.pattern, step.group ?? 0)
    }

    case 'dedupe': {
      if (typeof step.field !== 'string' || step.field === '') {
        throw new CapabilityError('TRANSFORM_FIELD_REQUIRED', 'dedupe requires a target field')
      }
      return dedupeItems(items, step.field)
    }
  }
}

export const transformCapability: CapabilityDefinition<
  CapabilityInput<TransformStep>,
  TransformOutput
> = {
  type: 'transform',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['step', 'items'],
    properties: {
      step: { type: 'object', required: ['type', 'op', 'input_from', 'output_to'] },
      items: { type: 'array', items: { type: 'object' } },
    },
  },
  outputSchema: { type: 'array' },
  // Local arithmetic over data already in memory: no DOM, no network, no storage.
  permissions: ['none'],
  securityNotes:
    'Purely local and deterministic: reads only the records passed in, writes nothing, and reaches no DOM, network, storage or model. Regular expressions pass the ReDoS safety subset before use (ARCHITECTURE §5.4 rule 6).',

  async execute(input, ctx): Promise<TransformOutput> {
    // Validate before logging: the log line reads `items.length`, and a malformed input
    // must surface as a rejection, not as a TypeError from the log call.
    if (!Array.isArray(input.items)) {
      throw new CapabilityError(
        'INPUT_NOT_ARRAY',
        `transform expected an array of records, got ${typeof input.items}`,
      )
    }

    // Shape and count only — never the values: these records are page content.
    ctx.ports.log({
      tag: 'CAPABILITY',
      message: 'transform',
      details: [input.step.op, input.items.length],
    })

    return runTransform(input)
  },
}
