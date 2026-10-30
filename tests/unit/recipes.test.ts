/**
 * Every published recipe is a contract someone else will import, so they are validated as
 * data here rather than trusted until a user reports one broken.
 *
 * Three things are checked, and all three were violated by hand-written versions at least
 * once before this test existed:
 *
 * 1. the definition passes the same validator the build flow uses — a recipe that merely
 *    *looks* like a tool is the worst kind, because it fails at run time on someone
 *    else's page;
 * 2. `scenario.capabilities` matches the step types actually present — it is shown to users
 *    as a summary of what the recipe will do, so it has to be true before the run, not
 *    after;
 * 3. `health_baseline` carries no scraped content. This is the desensitisation rule from
 *    `docs/contributing/RECIPE_GUIDE.md`, machine-checked, because "I'll remember to check
 *    the diff" is exactly the promise that leaks a credential.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RecipeJson } from '@juxbly/core'
import { validateToolDefinition } from '@juxbly/dsl'

const RECIPES_DIR = resolve(process.cwd(), 'docs', 'recipes')

/** Directories containing a `recipe.json`. Absent directory ⇒ no recipes yet, not a failure. */
function recipePaths(): string[] {
  let entries: string[]
  try {
    entries = readdirSync(RECIPES_DIR)
  } catch {
    return []
  }

  const found: string[] = []
  for (const entry of entries) {
    const candidate = join(RECIPES_DIR, entry, 'recipe.json')
    try {
      if (statSync(candidate).isFile()) found.push(candidate)
    } catch {
      // A directory without recipe.json is a work in progress, not a broken recipe.
    }
  }
  return found.sort()
}

function load(path: string): RecipeJson {
  return JSON.parse(readFileSync(path, 'utf8')) as RecipeJson
}

const recipes = recipePaths().map((path) => ({ path, name: path.split('/').slice(-2)[0] ?? path, json: load(path) }))

describe('published recipes', () => {
  it('finds at least one, so this file cannot silently stop testing anything', () => {
    expect(recipes.length).toBeGreaterThan(0)
  })

  it.each(recipes.map((recipe) => [recipe.name, recipe.json] as const))(
    '%s passes tool-definition validation',
    (_name, json) => {
      const result = validateToolDefinition(json.definition)
      if (!result.ok) {
        // Printed rather than collapsed into a boolean: which rule broke is the only
        // useful thing to read when a hand-edited recipe stops being importable.
        expect(result.errors).toEqual([])
      }
      expect(result.ok).toBe(true)
    },
  )

  it.each(recipes.map((recipe) => [recipe.name, recipe.json] as const))(
    '%s declares only capabilities its steps use',
    (_name, json) => {
      const used = [...new Set(json.definition.steps.map((step) => step.type))].sort()
      expect([...json.scenario.capabilities].sort()).toEqual(used)
    },
  )

  it.each(recipes.map((recipe) => [recipe.name, recipe.json] as const))(
    '%s has an item count range, not a value',
    (_name, json) => {
      expect(json.health_baseline.expected_item_count).toMatch(/^\d+-\d+$/)
    },
  )

  it.each(recipes.map((recipe) => [recipe.name, recipe.json] as const))(
    '%s keeps every expected field named in its health baseline a declared type',
    (_name, json) => {
      const known = new Set(['text', 'numeric', 'image', 'link', 'attr'])
      for (const type of Object.values(json.health_baseline.expected_fields)) {
        expect(known.has(type)).toBe(true)
      }
    },
  )

  it.each(recipes.map((recipe) => [recipe.name, recipe.json] as const))(
    '%s lists only fields its extract step really produces',
    (_name, json) => {
      const step = json.definition.steps.find((candidate) => candidate.type === 'extract')
      expect(step).toBeDefined()
      if (step?.type !== 'extract') return

      const produced = Object.keys(step.fields)
      const claimed = Object.keys(json.health_baseline.expected_fields)
      expect(claimed.sort()).toEqual(produced.sort())
    },
  )

  it.each(recipes.map((recipe) => [recipe.name, recipe.json] as const))(
    '%s carries no scraped content in its health baseline',
    (_name, json) => {
      // Values this would catch: author names, quotes, prices, tag lists — anything the run
      // produced. Shapes ("text", "20-20") are all that belong here.
      const blob = JSON.stringify(json.health_baseline)
      expect(blob).not.toMatch(/[£$€]\s?\d/)
      expect(blob.length).toBeLessThan(400)
    },
  )

  it.each(recipes.map((recipe) => [recipe.name, recipe.json] as const))(
    '%s keeps scenario and definition agreeing on where it runs',
    (_name, json) => {
      expect(json.scenario.url_pattern).toBe(json.definition.url_pattern)
    },
  )
})
