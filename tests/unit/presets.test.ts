/**
 * The packed preset set (stage 3-2 Track B) — the bundle the extension ships.
 *
 * `docs/recipes/` is the single source, and this test is what keeps it true in the other
 * direction: `tests/unit/recipes.test.ts` validates what contributors wrote, this file
 * validates what the build actually packs. Two drifts are possible and both are caught:
 *
 * 1. a recipe directory that was never imported into `apps/extension/presets/presets.ts`
 *    — the pack would silently lag the docs;
 * 2. a packed entry that stopped being the file — a copy, a trimmed variant, an "improved"
 *    definition that nobody verified on the live page.
 *
 * The definitions are re-validated here because the bundle is the artifact the install
 * path trusts at build time — `handlePresetInstall` still re-validates at run time, but
 * a preset that cannot pass the gate should fail the build, not a user's click.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS } from '../../apps/extension/presets/presets'
import type { RecipeJson } from '@juxbly/core'
import { validateToolDefinition } from '@juxbly/dsl'

const RECIPES_DIR = resolve(process.cwd(), 'docs', 'recipes')

/** Directories containing a `recipe.json`; the set the pack must mirror exactly. */
function recipeDirs(): string[] {
  let entries: string[]
  try {
    entries = readdirSync(RECIPES_DIR)
  } catch {
    return []
  }
  return entries
    .filter((entry) => {
      try {
        return statSync(join(RECIPES_DIR, entry, 'recipe.json')).isFile()
      } catch {
        return false
      }
    })
    .sort()
}

function load(id: string): RecipeJson {
  return JSON.parse(readFileSync(join(RECIPES_DIR, id, 'recipe.json'), 'utf8')) as RecipeJson
}

const packed = [...BUILTIN_PRESETS].sort((a, b) => a.id.localeCompare(b.id))

describe('the packed preset set', () => {
  it('mirrors docs/recipes exactly — every directory packed, nothing else bundled', () => {
    expect(packed.map((preset) => preset.id)).toEqual(recipeDirs())
  })

  it.each(packed.map((preset) => [preset.id] as const))(
    '%s is the file on disk, not a fork of it',
    (id) => {
      const preset = packed.find((candidate) => candidate.id === id)
      expect(preset?.recipe).toEqual(load(id))
    },
  )

  it.each(packed.map((preset) => [preset.id, preset.recipe] as const))(
    '%s passes the tool-definition gate the install path runs',
    (_id, recipe) => {
      const result = validateToolDefinition(recipe.definition)
      if (!result.ok) {
        // The errors are printed, not collapsed: which §5.4 rule broke is the only
        // readable thing when a recipe stops being installable.
        expect(result.errors).toEqual([])
      }
      expect(result.ok).toBe(true)
    },
  )

  it.each(packed.map((preset) => [preset.id, preset.recipe] as const))(
    '%s runs on an http(s) origin the install flow can ask for',
    (_id, recipe) => {
      // A pattern may name a path or omit the wildcard (all three forms exist in the
      // pack), but Chrome's permissions API is origin-granular — the install derives
      // `origin + /*` from it, and that derivation must be possible.
      const pattern = recipe.scenario.url_pattern
      let origin: string | null = null
      try {
        const parsed = new URL(pattern)
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') origin = parsed.origin
      } catch {
        // Falls through to the failure below.
      }
      expect(origin).not.toBeNull()
      expect(origin).toMatch(/^https?:\/\/[^/\s]+$/)
      // The two spellings of "where this runs" must agree, or the card would offer a
      // grant that never matches the tool that lands.
      expect(recipe.definition.url_pattern).toBe(pattern)
    },
  )

  it('is not empty — a pack that stopped packing anything must fail loudly here', () => {
    expect(packed.length).toBeGreaterThan(0)
  })
})
