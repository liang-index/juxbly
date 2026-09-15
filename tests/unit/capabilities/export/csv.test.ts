import { describe, expect, it } from 'vitest'
import { serializeCsv, toCsv } from '@juxbly/capabilities/export'

/**
 * CSV serialisation — `task/stage-1-15.md` Tests. The behaviour is pinned here because
 * the CSV that ships to a spreadsheet is a trust boundary: escaping, the BOM and the
 * formula-injection prefix are decided once, in the serializer, and a test keeps every
 * later edit honest.
 */
describe('serializeCsv', () => {
  it('joins headers and rows with CRLF and no trailing issues', () => {
    expect(serializeCsv([{ a: '1', b: '2' }])).toBe('a,b\r\n1,2')
  })

  it('quotes fields that contain a comma, a quote or a line break', () => {
    const cells = serializeCsv([{ name: 'Smith, Jr', note: 'said "hi"', text: 'line\nbreak' }])
    expect(cells.split('\r\n')[1]).toBe(
      '"Smith, Jr","said ""hi""","line\nbreak"',
    )
  })

  it('quotes values with leading or trailing whitespace', () => {
    expect(serializeCsv([{ v: '  padded  ' }]).split('\r\n')[1]).toBe('"  padded  "')
  })

  it('prepends the UTF-8 BOM so spreadsheet apps read multi-byte text correctly', () => {
    const out = toCsv([{ name: 'café — naïve' }])
    expect(out.startsWith('\uFEFF')).toBe(true)
    expect(out).toContain('café — naïve')
  })

  it('exports an empty list as headerless content', () => {
    expect(toCsv([])).toBe('\uFEFF')
  })

  it('fills missing columns with an empty cell (ragged rows)', () => {
    // Order of first appearance defines the header; `b` exists in the second row only.
    expect(serializeCsv([{ a: '1' }, { a: '2', b: 'x' }])).toBe('a,b\r\n1,\r\n2,x')
  })

  it('makes every field name a header, escaped like a cell', () => {
    expect(serializeCsv([{ 'we,ird': '1' }]).split('\r\n')[0]).toBe('"we,ird"')
  })

  it('stringifies null, numbers, booleans and nested values readably', () => {
    // `[1,2]` stringifies with a comma, so it is *quoted* for that comma — a nested value
    // still round-trips as the text a reader would expect.
    expect(serializeCsv([{ n: 3, none: null, yes: true, list: [1, 2] }]).split('\r\n')[1]).toBe(
      '3,,true,"[1,2]"',
    )
  })

  it('rejects a non-array input', () => {
    expect(() => serializeCsv(null as unknown as readonly Record<string, unknown>[])).toThrow(
      'expected an array of records',
    )
  })
})

describe('CSV formula-injection protection', () => {
  it('apostrophe-prefixes a leading formula sign so a spreadsheet does not execute it', () => {
    for (const raw of ['=cmd', '+1', '-1', '@SUM(A1)']) {
      const cell = serializeCsv([{ v: raw }]).split('\r\n')[1] as string
      expect(cell.startsWith(`'${raw}`)).toBe(true)
    }
  })

  it('neutralises a leading tab or CR by quoting (the sheet reads text, not a trigger)', () => {
    // Tab and CR do not form formulas, but they can hide an executable start; quoting
    // makes the boundary visible. The value itself is unchanged inside the quotes.
    for (const raw of ['\tindented', '\rreturn']) {
      const cell = serializeCsv([{ v: raw }]).split('\r\n')[1] as string
      expect(cell.startsWith('"')).toBe(true)
      expect(cell).toContain(raw)
    }
  })

  it('keeps the content readable after neutralisation', () => {
    // The quoted value is still present in full after the prefix — a reader sees the text.
    const out = serializeCsv([{ v: '=cmd' }])
    expect(out).toContain("'=cmd")
    expect(out.split('\r\n')[1]).toBe("'=cmd")
  })
})