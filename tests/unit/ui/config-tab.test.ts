import type { ToolDefinition } from '@juxbly/dsl'
import { describe, expect, it } from 'vitest'
import { parseDraft, stringifyDefinition } from '@juxbly/ui'

/**
 * The config tab's draft gates — `task/stage-1-16.md` Scope 2 / Tests.
 *
 * Three rejections, each with a reason that names a field, because "could not save" is
 * the one answer that leaves a person staring at their JSON:
 *
 * - invalid JSON (a typo, not a design decision);
 * - an unknown **field** (§5.4 rule 8 — the gate that keeps the DSL from growing);
 * - an unknown **type** (same rule, and the likelier hand-editing mistake).
 */
function validDefinition(): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name: 'Deals under $50',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: '2026-09-09T00:00:00.000Z',
    updated_at: '2026-09-09T00:00:00.000Z',
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.deal',
        fields: { title: '.title', price: '.price' },
        output_to: 'raw_items',
      },
    ],
  }
}

describe('parseDraft (config tab, stage 1-16)', () => {
  it('accepts a valid definition and hands back the parsed value', () => {
    const result = parseDraft(JSON.stringify(validDefinition()))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.definition.tool_id).toBe('tool_a')
  })

  it('round-trips through stringifyDefinition without changing the definition', () => {
    const text = stringifyDefinition(validDefinition())

    expect(parseDraft(text)).toEqual({ ok: true, definition: validDefinition() })
  })

  it('rejects invalid JSON with the parser’s own position-bearing message', () => {
    const result = parseDraft('{ "tool_id": ')

    expect(result).toMatchObject({ ok: false, reason: 'invalid_json' })
    if (!result.ok && result.reason === 'invalid_json') {
      expect(result.message).not.toBe('')
    }
  })

  it('rejects an unknown field with its path — the DSL does not grow quietly (§5.4.8)', () => {
    const draft = { ...validDefinition(), steps: [{ ...validDefinition().steps[0], sort_by: 'price' }] }

    const result = parseDraft(JSON.stringify(draft))

    expect(result).toMatchObject({ ok: false, reason: 'invalid_definition' })
    if (!result.ok && result.reason === 'invalid_definition') {
      expect(result.errors.some((error) => error.code === 'UNKNOWN_FIELD')).toBe(true)
      expect(
        result.errors.some((error) => error.path.startsWith('steps[0].')),
      ).toBe(true)
    }
  })

  it('rejects an unknown step type — a hand-edit is validated exactly like model output', () => {
    const draft = {
      ...validDefinition(),
      steps: [{ ...validDefinition().steps[0], type: 'scrape' }],
    }

    const result = parseDraft(JSON.stringify(draft))

    expect(result).toMatchObject({ ok: false, reason: 'invalid_definition' })
    if (!result.ok && result.reason === 'invalid_definition') {
      expect(result.errors.some((error) => error.code === 'STEP_TYPE_UNKNOWN')).toBe(true)
    }
  })
})
