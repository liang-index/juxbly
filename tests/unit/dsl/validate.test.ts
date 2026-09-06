import { describe, expect, it } from 'vitest'
import { validateToolDefinition } from '@juxbly/dsl'

/**
 * §5.4 — one positive and at least one negative case per rule, plus the shape checks
 * that have to hold before the rules can even be evaluated. Task file: stage 1-1
 * Tests 1–8.
 */

/** A minimal definition that passes every rule; tests override one thing at a time. */
function validDefinition(): Record<string, unknown> {
  return {
    tool_id: 'tool_8f3a2b',
    name: 'Price extractor',
    category: 'data',
    url_pattern: 'example.com/*',
    version: 1,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.item',
        fields: { title: 'h2' },
        output_to: 'items',
      },
      { type: 'render', view: 'table', input_from: 'items' },
    ],
    created_at: '2026-09-05T00:00:00Z',
    updated_at: '2026-09-05T00:00:00Z',
  }
}

interface SimpleError {
  code: string
  path: string
}

function errorsOf(input: unknown): SimpleError[] {
  const result = validateToolDefinition(input)
  if (result.ok) throw new Error('expected the definition to be rejected')
  return result.errors.map((error) => ({ code: error.code, path: error.path }))
}

function codesOf(input: unknown): string[] {
  return errorsOf(input).map((error) => error.code)
}

describe('validateToolDefinition — acceptance', () => {
  it('accepts a well-formed definition and narrows the value', () => {
    const input = validDefinition()
    const result = validateToolDefinition(input)
    if (!result.ok) throw new Error(`unexpected errors: ${JSON.stringify(result.errors)}`)
    // The discriminated union (ARCHITECTURE §5.5, E3): value exists only on ok: true.
    expect(result.value.tool_id).toBe('tool_8f3a2b')
    expect(result.value.steps).toHaveLength(2)
  })

  it('collects several errors instead of stopping at the first', () => {
    const input = validDefinition()
    delete input['name']
    input['version'] = 0
    expect(codesOf(input)).toEqual(expect.arrayContaining(['NAME_INVALID', 'VERSION_INVALID']))
  })
})

describe('rule 1 — steps non-empty, output_to globally unique', () => {
  it('rejects missing steps', () => {
    const input = validDefinition()
    delete input['steps']
    expect(codesOf(input)).toContain('STEPS_EMPTY')
  })

  it('rejects empty steps', () => {
    const input = validDefinition()
    input['steps'] = []
    expect(codesOf(input)).toContain('STEPS_EMPTY')
  })

  it('rejects a duplicate output_to and points at the later step', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      { type: 'extract', mode: 'single', fields: { price: '.p' }, output_to: 'items' },
      { type: 'render', view: 'table', input_from: 'items' },
    ]
    const errors = errorsOf(input)
    expect(errors.map((error) => error.code)).toContain('OUTPUT_TO_DUPLICATE')
    const duplicate = errors.find((error) => error.code === 'OUTPUT_TO_DUPLICATE')
    expect(duplicate?.path).toBe('steps[1].output_to')
  })
})

describe('rule 2 — input_from references an earlier step only', () => {
  it('accepts a reference to an earlier produced variable', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      { type: 'transform', op: 'dedupe', input_from: 'items', field: 'title', output_to: 'unique' },
      { type: 'render', view: 'table', input_from: 'unique' },
    ]
    expect(validateToolDefinition(input).ok).toBe(true)
  })

  it('rejects a forward reference', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'first' },
      { type: 'transform', op: 'dedupe', input_from: 'second', field: 'title', output_to: 'deduped' },
      { type: 'extract', mode: 'single', fields: { price: '.p' }, output_to: 'second' },
    ]
    expect(codesOf(input)).toContain('INPUT_FROM_UNRESOLVED')
  })

  it('rejects a self-reference (a step cannot consume its own output)', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      { type: 'transform', op: 'dedupe', input_from: 'unique', field: 'title', output_to: 'unique' },
    ]
    expect(codesOf(input)).toContain('INPUT_FROM_UNRESOLVED')
  })

  it('rejects a render step referencing nothing', () => {
    const input = validDefinition()
    input['steps'] = [{ type: 'render', view: 'table', input_from: 'ghost' }]
    expect(codesOf(input)).toContain('INPUT_FROM_UNRESOLVED')
  })
})

describe('rule 3 — render and export declare no output_to', () => {
  it('rejects a render step with output_to, without a redundant unknown-field error', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      { type: 'render', view: 'table', input_from: 'items', output_to: 'nope' },
    ]
    const codes = codesOf(input)
    expect(codes).toContain('CONSUMER_HAS_OUTPUT_TO')
    expect(codes).not.toContain('UNKNOWN_FIELD')
  })

  it('rejects an export step with output_to', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      { type: 'export', format: 'copy', input_from: 'items', output_to: 'nope' },
    ]
    expect(codesOf(input)).toContain('CONSUMER_HAS_OUTPUT_TO')
  })
})

describe('rule 4 — extract shape and pre_scroll bounds', () => {
  it('rejects empty fields', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: {}, output_to: 'items' },
    ]
    expect(codesOf(input)).toContain('EXTRACT_FIELDS_EMPTY')
  })

  it('rejects list mode without a container selector', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'list', fields: { title: 'h2' }, output_to: 'items' },
    ]
    expect(codesOf(input)).toContain('EXTRACT_SELECTOR_REQUIRED')
  })

  it('accepts single mode with a selector (relative field resolution)', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', selector: 'main', fields: { title: 'h1' }, output_to: 'page' },
      { type: 'render', view: 'text', input_from: 'page' },
    ]
    expect(validateToolDefinition(input).ok).toBe(true)
  })

  it('rejects pre_scroll modes other than to_bottom', () => {
    const input = validDefinition()
    input['steps'] = [
      {
        type: 'extract',
        mode: 'list',
        selector: '.item',
        fields: { title: 'h2' },
        pre_scroll: { mode: 'click_more' },
        output_to: 'items',
      },
    ]
    expect(codesOf(input)).toContain('PRE_SCROLL_MODE')
  })

  it('rejects pre_scroll.max outside 1–10 (hard page-safety cap)', () => {
    const input = validDefinition()
    input['steps'] = [
      {
        type: 'extract',
        mode: 'list',
        selector: '.item',
        fields: { title: 'h2' },
        pre_scroll: { mode: 'to_bottom', max: 11 },
        output_to: 'items',
      },
    ]
    expect(codesOf(input)).toContain('PRE_SCROLL_MAX_RANGE')
  })

  it('rejects pre_scroll.settle_ms outside 0–2000', () => {
    const input = validDefinition()
    input['steps'] = [
      {
        type: 'extract',
        mode: 'list',
        selector: '.item',
        fields: { title: 'h2' },
        pre_scroll: { mode: 'to_bottom', settle_ms: 3000 },
        output_to: 'items',
      },
    ]
    expect(codesOf(input)).toContain('PRE_SCROLL_SETTLE_RANGE')
  })

  it('accepts a well-formed pre_scroll', () => {
    const input = validDefinition()
    input['steps'] = [
      {
        type: 'extract',
        mode: 'list',
        selector: '.item',
        fields: { title: 'h2' },
        pre_scroll: { mode: 'to_bottom', max: 5, settle_ms: 600 },
        output_to: 'items',
      },
      { type: 'render', view: 'table', input_from: 'items' },
    ]
    expect(validateToolDefinition(input).ok).toBe(true)
  })

  it('rejects field_types naming a field the step does not extract', () => {
    const input = validDefinition()
    input['steps'] = [
      {
        type: 'extract',
        mode: 'single',
        fields: { title: 'h1' },
        field_types: { price: 'text' },
        output_to: 'page',
      },
    ]
    expect(codesOf(input)).toContain('FIELD_TYPE_UNKNOWN_FIELD')
  })
})

describe('rule 5 — transform op parameter completeness', () => {
  function withTransform(transform: Record<string, unknown>): Record<string, unknown> {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      transform,
      { type: 'render', view: 'table', input_from: 'out' },
    ]
    return input
  }

  it('rejects filter without a condition', () => {
    expect(codesOf(withTransform({ type: 'transform', op: 'filter', input_from: 'items', output_to: 'out' }))).toContain(
      'TRANSFORM_CONDITION_REQUIRED',
    )
  })

  it('rejects sort without order', () => {
    expect(
      codesOf(withTransform({ type: 'transform', op: 'sort', input_from: 'items', field: 'title', output_to: 'out' })),
    ).toContain('TRANSFORM_ORDER_REQUIRED')
  })

  it('rejects regex without a pattern', () => {
    expect(
      codesOf(withTransform({ type: 'transform', op: 'regex', input_from: 'items', field: 'title', output_to: 'out' })),
    ).toContain('TRANSFORM_PATTERN_REQUIRED')
  })

  it('rejects dedupe without a field', () => {
    expect(codesOf(withTransform({ type: 'transform', op: 'dedupe', input_from: 'items', output_to: 'out' }))).toContain(
      'TRANSFORM_FIELD_REQUIRED',
    )
  })

  it('rejects an unknown op', () => {
    expect(codesOf(withTransform({ type: 'transform', op: 'map', input_from: 'items', output_to: 'out' }))).toContain(
      'TRANSFORM_OP_UNKNOWN',
    )
  })
})

describe('rule 6 — regex patterns must pass the safety subset', () => {
  it('rejects a nested-quantifier pattern in a regex step', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      {
        type: 'transform',
        op: 'regex',
        input_from: 'items',
        field: 'title',
        pattern: '(a+)+',
        output_to: 'out',
      },
    ]
    expect(codesOf(input)).toContain('REGEX_UNSAFE')
  })

  it('rejects an unsafe pattern in a matches condition too', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'items' },
      {
        type: 'transform',
        op: 'filter',
        input_from: 'items',
        condition: { field: 'title', op: 'matches', value: '(x+x+)+y' },
        output_to: 'out',
      },
    ]
    expect(codesOf(input)).toContain('REGEX_UNSAFE')
  })
})

describe('rule 7 — url_pattern must parse', () => {
  it('rejects an empty pattern', () => {
    const input = validDefinition()
    input['url_pattern'] = ''
    expect(codesOf(input)).toContain('URL_PATTERN_INVALID')
  })

  it('rejects a wildcard host with the parse error message', () => {
    const input = validDefinition()
    input['url_pattern'] = '*.example.com/*'
    const errors = errorsOf(input)
    expect(errors.map((error) => error.code)).toContain('URL_PATTERN_INVALID')
  })

  it('accepts a pattern with scheme and query (stripped by the parser)', () => {
    const input = validDefinition()
    input['url_pattern'] = 'https://example.com/path?x=1'
    expect(validateToolDefinition(input).ok).toBe(true)
  })
})

describe('rule 8 — unknown types and unknown fields are rejected', () => {
  it('rejects an unknown top-level field', () => {
    const input = validDefinition()
    input['xpath_mode'] = true
    expect(codesOf(input)).toContain('UNKNOWN_FIELD')
  })

  it('rejects an unknown step type', () => {
    const input = validDefinition()
    input['steps'] = [{ type: 'click', selector: '.btn' }]
    expect(codesOf(input)).toContain('STEP_TYPE_UNKNOWN')
  })

  it('rejects an unknown field on a step', () => {
    const input = validDefinition()
    input['steps'] = [
      { type: 'extract', mode: 'single', fields: { title: 'h1' }, xpath: '//h1', output_to: 'items' },
    ]
    expect(codesOf(input)).toContain('UNKNOWN_FIELD')
  })

  it('rejects an unknown category (the removed monitor included)', () => {
    const input = validDefinition()
    input['category'] = 'monitor'
    expect(codesOf(input)).toContain('CATEGORY_UNKNOWN')
  })
})

describe('shape — before the rules can run', () => {
  it('rejects non-object input', () => {
    for (const input of [null, 'tool', 42, [validDefinition()]]) {
      expect(codesOf(input)).toContain('NOT_AN_OBJECT')
    }
  })

  it('rejects a step that is not an object', () => {
    const input = validDefinition()
    input['steps'] = ['extract']
    expect(codesOf(input)).toContain('STEP_NOT_AN_OBJECT')
  })

  it('rejects an empty tool_id or name', () => {
    const input = validDefinition()
    input['tool_id'] = ''
    input['name'] = '   '
    const codes = codesOf(input)
    expect(codes).toContain('TOOL_ID_INVALID')
    expect(codes).toContain('NAME_INVALID')
  })

  it('rejects a non-ISO timestamp', () => {
    const input = validDefinition()
    input['created_at'] = 'yesterday'
    expect(codesOf(input)).toContain('TIMESTAMP_INVALID')
  })
})
