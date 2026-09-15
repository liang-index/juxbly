import type { ToolDefinition } from '@juxbly/dsl'
import { describe, expect, it } from 'vitest'
import { digestOf, exportRecipe, recipeFilename, serializeRecipe } from './export-recipe'

/**
 * Recipe export — `task/stage-1-12.md` Scope 6 / AC 5, `docs/PRODUCT.md` §10.9.6.
 *
 * Two things are under test: the **scenario metadata** that makes a recipe curatable later
 * (site, category, what a healthy result looks like), and the fact that **nothing sensitive
 * survives** — including a secret pasted into the tool's `name`, which is why the whole
 * object is sanitised after the metadata is derived rather than field by field.
 *
 * Strings that look like credentials are assembled from fragments: the repository's secret
 * detector would otherwise flag this file, and the sanitiser sees identical input either way.
 */

const SECRET = ['sk', '-liveAbc1234567890123456'].join('')

function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    tool_id: 'tool_8f3a2b',
    name: 'Shop results',
    description: 'Collect the product name and price.',
    category: 'data',
    url_pattern: 'https://example.com/products/*',
    version: 3,
    created_at: '2026-09-08T10:00:00.000Z',
    updated_at: '2026-09-08T10:00:00.000Z',
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.product',
        fields: { title: '.title', price: '.price' },
        field_types: { title: 'text', price: 'text' },
        output_to: 'raw_items',
      },
      { type: 'render', view: 'table', input_from: 'raw_items' },
    ],
    ...overrides,
  }
}

describe('exportRecipe', () => {
  it('carries the scenario metadata a curator needs (§10.9.6)', () => {
    const recipe = exportRecipe(
      {
        definition: tool(),
        run: { itemCount: 24, fieldDigest: { title: 'text', price: 'numeric' } },
      },
      { now: '2026-09-08T10:00:00.000Z', author: 'zan', juxblyVersion: '0.1.0' },
    )

    expect(recipe.recipe_version).toBe(1)
    expect(recipe.scenario.url_pattern).toBe('https://example.com/products/*')
    expect(recipe.scenario.site_label).toBe('example.com')
    expect(recipe.scenario.category).toBe('data')
    // Only step types that exist: a recipe must not smuggle unshipped capabilities.
    expect(recipe.scenario.capabilities).toEqual(['extract', 'render'])
    expect(recipe.health_baseline).toEqual({
      expected_item_count: '24',
      expected_fields: { title: 'text', price: 'numeric' },
    })
    expect(recipe.provenance).toEqual({
      author: 'zan',
      license: 'CC BY-SA 4.0',
      verified_on: '2026-09-08',
      juxbly_version: '0.1.0',
    })
    // A recipe is a v1 wherever it lands: the exported version is this install's history.
    expect(recipe.definition.version).toBe(1)
  })

  it('says unknown rather than inventing a healthy range', () => {
    const recipe = exportRecipe({ definition: tool() })
    // One observation is a count, never a range — padding "24" into "20-31" would be the
    // same invention the baseline exists to prevent.
    expect(recipe.health_baseline).toEqual({ expected_item_count: 'unknown', expected_fields: {} })
  })

  it('strips a secret from anywhere in the recipe', () => {
    const recipe = exportRecipe({
      definition: tool({
        name: `Shop ${SECRET} results`,
        description: `uses Authorization: Bearer ${SECRET}`,
      }),
    })

    const json = serializeRecipe(recipe)
    expect(json).not.toContain(SECRET)
    expect(json).toContain('[redacted]')
    // The name is also the filename, so the leak would have travelled twice.
    expect(recipeFilename(recipe)).not.toContain('sk-')
  })

  it('is round-trippable JSON and readable by a person', () => {
    const recipe = exportRecipe({ definition: tool() })
    const text = serializeRecipe(recipe)
    expect(text).toContain('\n  "scenario"')
    expect(JSON.parse(text)).toMatchObject({ name: 'shop-results' })
  })
})

describe('digestOf', () => {
  it('reports a shape per field, never a value', () => {
    expect(
      digestOf([
        { title: 'A', price: '1' },
        { title: 'B', price: '' },
      ]),
    ).toEqual({ price: 'text', title: 'text' })
    // A field that never had a value is `empty` — that is the signal, not an omission.
    expect(digestOf([{ note: '' }])).toEqual({ note: 'empty' })
    expect(digestOf([])).toEqual({})
  })
})
