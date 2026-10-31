/**
 * The launch preset pack (stage 3-2 Track B) — `docs/recipes/` compiled into the
 * extension.
 *
 * `docs/recipes/` is the **single source**: every file here is an import of the exact
 * JSON a contributor authored and `tests/unit/recipes.test.ts` validates. Nothing is
 * copied, inlined or reformatted on the way in — the pair of guard tests below and in
 * that file make a fork visible the moment it exists. Adding a recipe to the pack means
 * adding its directory to `docs/recipes/` and one import here; forgetting the import
 * fails `tests/unit/presets.test.ts`, which compares the two sets.
 *
 * The JSON module type is widened (`type` becomes `string`), so each import is narrowed
 * once, here, with a cast — and trusted nowhere: `handlePresetInstall` re-validates with
 * `validateToolDefinition` before anything is written, and the pack quality gate asserts
 * every entry passes it at build time too.
 */
import type { RecipeJson } from '@juxbly/core'
import booksToscrapeBooks from '../../../docs/recipes/books-toscrape-books/recipe.json'
import quotesToscrapeQuotes from '../../../docs/recipes/quotes-toscrape-quotes/recipe.json'
import scrapethissiteCountries from '../../../docs/recipes/scrapethissite-countries/recipe.json'
import webscraperioFirstTable from '../../../docs/recipes/webscraperio-first-table/recipe.json'

/** One packed recipe: the directory name is the stable id, the JSON is everything else. */
export interface BuiltinPreset {
  id: string
  recipe: RecipeJson
}

function asRecipe(value: unknown): RecipeJson {
  return value as RecipeJson
}

export const BUILTIN_PRESETS: readonly BuiltinPreset[] = [
  { id: 'books-toscrape-books', recipe: asRecipe(booksToscrapeBooks) },
  { id: 'quotes-toscrape-quotes', recipe: asRecipe(quotesToscrapeQuotes) },
  { id: 'webscraperio-first-table', recipe: asRecipe(webscraperioFirstTable) },
  { id: 'scrapethissite-countries', recipe: asRecipe(scrapethissiteCountries) },
]
