import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Copy discipline — `docs/UI_SPEC.md` §9.5, `task/stage-1-10.md` AC 14.
 *
 * Every user-visible string goes through `packages/ui/src/copy/`, because the product
 * ships in English but the structure has to hold a second locale from day one (4-5). A
 * string written straight into JSX is a string no one can translate, and it is invisible
 * in review: the component looks right and the sentence is correct.
 *
 * Two rules, because a string can enter the DOM two ways:
 *
 *   1. as a JSX **text node** — `<p>Running…</p>`;
 *   2. as a JSX **attribute** — `<button aria-label="Run this tool again">`.
 *
 * Comments are stripped first: this file is about what reaches a user, and a comment that
 * quotes the copy is documentation, not a second source of truth.
 */
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const UI_SRC = 'packages/ui/src'
const SKIPPED = new Set(['copy', 'node_modules', 'dist'])
const SOURCE_EXTENSIONS = ['.ts', '.tsx']

/** Attribute names whose value is structure, not language. */
const STRUCTURAL_ATTRIBUTES = new Set([
  'className',
  'class',
  'id',
  'key',
  'type',
  'role',
  'href',
  'target',
  'rel',
  'name',
  'value',
  'method',
  'dir',
  'lang',
  'scope',
  'part',
  'slot',
  'as',
  'width',
  'height',
  // SVG geometry: an icon's `fill="none"` is not a sentence.
  'fill',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'viewBox',
  // Browser behaviour, not language: `autoComplete="off"` on a key field stops the
  // browser from storing it, and `spellCheck={false}` stops it from being red-squiggled.
  // Neither is a sentence a translator would ever see.
  'autoComplete',
  'autoCorrect',
  'autoCapitalize',
  'spellCheck',
  'autoFocus',
  'inputMode',
  'd',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
])

/**
 * A JSX text node: `>` then characters then `<`, with none of the punctuation a type
 * parameter or a call carries — `Record<string, unknown>` is not prose even though it
 * sits between two angle brackets.
 */
const JSX_TEXT = />([^<>{}();:=,.\\\n]*[A-Za-z]{2,}[^<>{}();:=,.\\\n]*)</g
const JSX_ATTRIBUTE = /\s([A-Za-z][\w:-]*)="([^"{}]*)"/g

function collectSourceFiles(relativeDir: string): string[] {
  const entries = readdirSync(join(REPO_ROOT, relativeDir), { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(relativeDir, entry.name)

    if (entry.isDirectory()) {
      if (SKIPPED.has(entry.name)) continue
      files.push(...collectSourceFiles(entryPath))
      continue
    }

    if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue
    if (entry.name.includes('.test.')) continue
    files.push(entryPath)
  }

  return files
}

/**
 * Removes `//`, `/* *\/` and the string literals that could otherwise hide them. Stateful
 * on purpose: a regex cannot tell `https://` in a string from the start of a comment.
 */
function stripComments(source: string): string {
  let out = ''
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code'
  let index = 0

  while (index < source.length) {
    const char = source.charAt(index)
    const next = source.charAt(index + 1)

    if (mode === 'code') {
      if (char === '/' && next === '/') {
        mode = 'line'
        index += 2
        continue
      }
      if (char === '/' && next === '*') {
        mode = 'block'
        index += 2
        continue
      }
      if (char === "'" || char === '"' || char === '`') {
        mode = char === "'" ? 'single' : char === '"' ? 'double' : 'template'
        out += char
        index += 1
        continue
      }
      out += char
      index += 1
      continue
    }

    if (mode === 'line') {
      if (char === '\n') {
        mode = 'code'
        out += char
      }
      index += 1
      continue
    }

    if (mode === 'block') {
      if (char === '*' && next === '/') {
        mode = 'code'
        index += 2
        continue
      }
      if (char === '\n') out += char
      index += 1
      continue
    }

    // Inside a string: keep it (the rules below read strings), but honour escapes.
    if (char === '\\') {
      out += char + next
      index += 2
      continue
    }
    const closer = mode === 'single' ? "'" : mode === 'double' ? '"' : '`'
    if (char === closer) mode = 'code'
    out += char
    index += 1
  }

  return out
}

const SOURCE_FILES = collectSourceFiles(UI_SRC).map((file) => ({
  file,
  code: stripComments(readFileSync(join(REPO_ROOT, file), 'utf8')),
}))

describe('copy discipline (UI_SPEC §9.5)', () => {
  it('finds the UI source tree — the scan below must not pass vacuously', () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(5)
  })

  it('keeps English out of JSX text nodes', () => {
    const offenders = SOURCE_FILES.flatMap(({ file, code }) =>
      [...code.matchAll(JSX_TEXT)].map((match) => `${file}: ${match[1]?.trim()}`),
    )

    expect(offenders).toEqual([])
  })

  it('keeps English out of JSX attributes', () => {
    const offenders: string[] = []

    for (const { file, code } of SOURCE_FILES) {
      for (const match of code.matchAll(JSX_ATTRIBUTE)) {
        const [, attribute, value] = match
        if (attribute === undefined || attribute.startsWith('data-') || attribute.startsWith('aria-hidden')) {
          continue
        }
        if (STRUCTURAL_ATTRIBUTES.has(attribute)) continue
        if (/[A-Za-z]{2,}/.test(value ?? '')) offenders.push(`${file}: ${attribute}="${value}"`)
      }
    }

    expect(offenders).toEqual([])
  })
})
