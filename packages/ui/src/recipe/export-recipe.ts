/**
 * Recipe export — `docs/PRODUCT.md` §10.9.6, `docs/contributing/RECIPE_GUIDE.md`,
 * `task/stage-1-12.md` Scope 6. The type is `RecipeJson` (`docs/ARCHITECTURE.md` §5.5).
 *
 * A recipe is a tool definition plus the **scenario metadata that makes it curatable**:
 * which site, which category, what a healthy result looks like. No registry, no heartbeat,
 * no collective repair — those are §10.9.4 items and none of them is in V1. The metadata is
 * here so that when those arrive the corpus already has something to select on.
 *
 * Every export goes through `sanitizeValue` on the way out, after the metadata has been
 * derived: desensitisation is the last gate, and it has to see the *whole* object — a
 * credential pasted into the tool's `name` is just as much a leak as one in a prompt.
 */
import type { RecipeJson } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { sanitizeValue } from './sanitize'

/** The run a recipe is exported from — the only honest source of a health baseline. */
export interface RecipeRun {
  itemCount: number
  /** Field name → shape digest, the same vocabulary as `RunSummary.field_digest` (§8.1). */
  fieldDigest: Record<string, string>
}

export interface RecipeSource {
  definition: ToolDefinition
  /**
   * Absent ⇒ the baseline says `unknown`. A recipe that invents a healthy range is worse
   * than one that admits it has never been measured — the baseline is the thing a future
   * benchmark would trust.
   */
  run?: RecipeRun | null
}

export interface RecipeExportOptions {
  /** GitHub handle. Empty by default: attribution is the author's to claim, never assumed. */
  author?: string
  /** Asked, never assumed — the guide offers CC BY-SA 4.0 and CC0. */
  license?: RecipeJson['provenance']['license']
  juxblyVersion?: string
  /** ISO timestamp; defaults to now. */
  now?: string
}

export function exportRecipe(source: RecipeSource, options: RecipeExportOptions = {}): RecipeJson {
  const definition = source.definition
  const at = options.now ?? new Date().toISOString()

  const recipe: RecipeJson = {
    recipe_version: 1,
    name: kebabCase(definition.name === '' ? definition.tool_id : definition.name),
    title: definition.name,
    description: definition.description ?? '',
    scenario: {
      url_pattern: definition.url_pattern,
      site_label: siteLabelOf(definition.url_pattern),
      category: definition.category,
      capabilities: [...new Set(definition.steps.map((step) => step.type))],
      /**
       * Always `regular` from an export: how hard a page is to read is a judgement about
       * the *site*, and the only thing that could claim otherwise is a person who tried
       * (RECIPE_GUIDE asks the author to set it).
       */
      page_difficulty: 'regular',
    },
    health_baseline: {
      expected_item_count: expectedItemCount(source.run ?? null),
      expected_fields: source.run?.fieldDigest ?? {},
    },
    // A recipe is a v1 wherever it lands: the version it was exported from is history of
    // *this* install, not of the tool someone else is about to create.
    definition: { ...definition, version: 1 },
    provenance: {
      author: options.author ?? '',
      license: options.license ?? 'CC BY-SA 4.0',
      verified_on: at.slice(0, 10),
      juxbly_version: options.juxblyVersion ?? '',
    },
  }

  return sanitizeValue(recipe) as RecipeJson
}

/** Pretty-printed on purpose: a recipe is read by people before it is read by machines. */
export function serializeRecipe(recipe: RecipeJson): string {
  return JSON.stringify(recipe, null, 2)
}

export function recipeFilename(recipe: RecipeJson): string {
  return `${recipe.name === '' ? 'juxbly-recipe' : recipe.name}.json`
}

/**
 * The shape digest of a result set, mirroring `packages/runtime`'s summary (`empty` /
 * `numeric` / `text` / `mixed`). It is restated here rather than imported because a recipe
 * is exported from a panel that holds rows, not a `RunSummary` — and because a digest is a
 * statistic, never a value: no page content reaches the recipe through it.
 */
export function digestOf(items: readonly Record<string, unknown>[]): Record<string, string> {
  const names = [...new Set(items.flatMap((row) => Object.keys(row)))].sort()
  const digest: Record<string, string> = {}

  for (const name of names) {
    const values = items
      .map((row) => row[name])
      .filter((value) => value !== undefined && value !== null && value !== '')
    if (values.length === 0) {
      digest[name] = 'empty'
      continue
    }
    if (values.every((value) => typeof value === 'number')) {
      digest[name] = 'numeric'
      continue
    }
    digest[name] = values.every((value) => typeof value === 'string') ? 'text' : 'mixed'
  }

  return digest
}

/**
 * One observation yields one number, not a range: the guide's `"20-31"` needs several runs,
 * and padding a single count into a range would be the same invention as an unknown.
 */
function expectedItemCount(run: RecipeRun | null): string {
  if (run === null) return 'unknown'
  return String(run.itemCount)
}

/** "news.ycombinator.com/*" → "news.ycombinator.com". A label, not a matcher (§5.3). */
function siteLabelOf(pattern: string): string {
  return pattern
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/\*\./, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
}

function kebabCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
