import { describe, expect, it } from 'vitest'
import { toJson } from '@juxbly/capabilities/export'

/**
 * JSON serialisation — `task/stage-1-15.md` Tests. JSON is the developer's export: the
 * shape the model and `extract` produced is preserved exactly (no BOM, no padding of
 * missing fields), and what ships must round-trip through `JSON.parse` unchanged.
 */
describe('toJson', () => {
  it('pretty-prints with two-space indentation and no BOM', () => {
    const out = toJson([{ a: 1 }])
    expect(out).toBe('[\n  {\n    "a": 1\n  }\n]')
    expect(out.startsWith('\uFEFF')).toBe(false)
  })

  it('keeps nested objects, arrays and nulls in their original shape', () => {
    const rows = [{ a: { deep: [1, null, 'x'] }, b: null }]
    const out = toJson(rows)
    expect(JSON.parse(out)).toEqual(rows)
  })

  it('does not pad a missing field (keeps the original structure)', () => {
    const rows = [{ a: '1' }, { b: '2' }]
    expect(JSON.parse(toJson(rows))).toEqual([{ a: '1' }, { b: '2' }])
  })

  it('serialises empty data as an empty array', () => {
    expect(toJson([])).toBe('[]')
  })

  it('round-trips anything the render layer produced', () => {
    const rows = [
      { title: 'p', price: 12.5, link: 'https://example.com', img: { src: 'x.png', alt: 'p' } },
    ]
    expect(JSON.parse(toJson(rows))).toEqual(rows)
  })

  it('rejects a non-array input', () => {
    expect(() => toJson(null as unknown as readonly Record<string, unknown>[])).toThrow(
      'expected an array of records',
    )
  })
})