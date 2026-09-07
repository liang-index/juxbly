import { describe, expect, it } from 'vitest'
import { CapabilityError, transformCapability } from '@juxbly/capabilities'
import type { TransformStep } from '@juxbly/dsl'
import { ctxStub, ctxWithLog } from '../ctx'

/**
 * The capability surface around the four ops: permission declaration, the second
 * validation fence, and the log rule (shape and count only — never values).
 */
function step(partial: Partial<Omit<TransformStep, 'type' | 'input_from' | 'output_to'>>): TransformStep {
  return { type: 'transform', op: 'filter', input_from: 'rows', output_to: 'filtered', ...partial }
}

const ITEMS = [{ price: 10 }, { price: 20 }]

describe('transformCapability: declaration', () => {
  it('needs no permission: it is local arithmetic over data already in memory', () => {
    expect(transformCapability.permissions).toEqual(['none'])
  })

  it('carries security notes, as every capability must', () => {
    expect(transformCapability.securityNotes.length).toBeGreaterThan(20)
    expect(transformCapability.securityNotes).toMatch(/local/i)
  })
})

describe('transformCapability: execute', () => {
  it('filters and returns the records', async () => {
    const result = await transformCapability.execute(
      { step: step({ op: 'filter', condition: { field: 'price', op: '>', value: 15 } }), items: ITEMS },
      ctxStub(),
    )

    expect(result).toEqual([{ price: 20 }])
  })

  it('rejects an input that is not an array of records', async () => {
    try {
      await transformCapability.execute(
        { step: step({ op: 'dedupe', field: 'price' }), items: undefined as unknown as Record<string, unknown>[] },
        ctxStub(),
      )
      expect.unreachable('expected a rejection')
    } catch (error) {
      expect((error as CapabilityError).code).toBe('INPUT_NOT_ARRAY')
    }
  })

  it('rejects an incomplete step before touching any record', async () => {
    const cases: [TransformStep, string][] = [
      [step({ op: 'filter' }), 'TRANSFORM_CONDITION_REQUIRED'],
      [step({ op: 'sort' }), 'TRANSFORM_FIELD_REQUIRED'],
      [step({ op: 'sort', field: 'price' }), 'TRANSFORM_ORDER_REQUIRED'],
      [step({ op: 'regex' }), 'TRANSFORM_FIELD_REQUIRED'],
      [step({ op: 'regex', field: 'price' }), 'TRANSFORM_PATTERN_REQUIRED'],
      [step({ op: 'dedupe' }), 'TRANSFORM_FIELD_REQUIRED'],
    ]

    for (const [broken, code] of cases) {
      try {
        await transformCapability.execute({ step: broken, items: ITEMS }, ctxStub())
        expect.unreachable(`expected ${code}`)
      } catch (error) {
        expect((error as CapabilityError).code).toBe(code)
      }
    }
  })

  it('logs shape and count only, never page content', async () => {
    const { ctx, logged } = ctxWithLog()

    await transformCapability.execute(
      { step: step({ op: 'filter', condition: { field: 'price', op: '>', value: 15 } }), items: ITEMS },
      ctx,
    )

    // "price: 10" must never appear in a log line: the records are page content.
    expect(logged.join(' ')).not.toContain('price')
    expect(logged[0]?.[0]).toContain('CAPABILITY')
  })
})
