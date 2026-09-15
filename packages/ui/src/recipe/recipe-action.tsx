import type { BrowserAdapter } from '@juxbly/browser'
import type { RecipeJson } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { useState, type ReactNode } from 'react'
import { t } from '../copy'
import { digestOf, exportRecipe, recipeFilename, serializeRecipe } from './export-recipe'

/**
 * "Export as Recipe" — `docs/PRODUCT.md` §10.9.6, `task/stage-1-12.md` Scope 6.
 *
 * The JSON is shown **before** anything can leave the browser: desensitisation is
 * pattern-based and cannot know that a URL is internal to somebody's company, so the last
 * gate is a person reading it (§10.9.6: what you see is what gets sent). Nothing is copied
 * and nothing is downloaded until the user asks for one of those explicitly.
 *
 * Delivery reuses the 1-15 paths: copy goes to the clipboard port (a real click, never an
 * automatic run) and the file goes through the background's download relay, because the
 * platform downloads API does not exist in the page context (§7.1).
 */
export function RecipeAction({
  adapter,
  items,
  tool,
}: {
  adapter: BrowserAdapter
  tool: ToolDefinition
  items: readonly Record<string, unknown>[]
}): ReactNode {
  const [recipe, setRecipe] = useState<RecipeJson | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const toggle = (): void => {
    setFeedback(null)
    setRecipe(
      recipe === null
        ? exportRecipe({
            definition: tool,
            run: { itemCount: items.length, fieldDigest: digestOf(items) },
          })
        : null,
    )
  }

  const deliver = async (mode: 'copy' | 'file'): Promise<void> => {
    if (recipe === null || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      if (mode === 'copy') {
        await adapter.clipboard.writeText(serializeRecipe(recipe))
      } else {
        await downloadRecipe(adapter, recipe)
      }
      setFeedback({
        tone: 'ok',
        text: t(mode === 'copy' ? 'run.export.copied' : 'run.export.downloading'),
      })
    } catch {
      setFeedback({ tone: 'error', text: t('run.recipe.failed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="jx-recipe">
      <button type="button" className="jx-chip" disabled={busy} onClick={toggle}>
        {t('run.recipe.action')}
      </button>

      {recipe === null ? null : (
        <div className="jx-recipe-preview-wrap">
          <p className="jx-recipe-note">{t('run.recipe.note')}</p>
          <pre className="jx-recipe-preview" aria-label={t('run.recipe.preview_aria')}>
            {serializeRecipe(recipe)}
          </pre>
          <div className="jx-recipe-buttons">
            <button
              type="button"
              className="jx-link"
              aria-label={t('run.recipe.copy_aria')}
              disabled={busy}
              onClick={() => void deliver('copy')}
            >
              {t('run.recipe.copy')}
            </button>
            <button
              type="button"
              className="jx-link"
              aria-label={t('run.recipe.download_aria')}
              disabled={busy}
              onClick={() => void deliver('file')}
            >
              {t('run.recipe.download')}
            </button>
            <button type="button" className="jx-link" onClick={() => setRecipe(null)}>
              {t('run.recipe.hide')}
            </button>
          </div>
        </div>
      )}

      {feedback === null ? null : (
        <p className="jx-run-export-feedback" data-tone={feedback.tone}>
          {feedback.text}
        </p>
      )}
    </div>
  )
}

async function downloadRecipe(adapter: BrowserAdapter, recipe: RecipeJson): Promise<void> {
  const reply = await adapter.messaging.send({
    kind: 'export:download_json',
    filename: recipeFilename(recipe),
    json: serializeRecipe(recipe),
  })
  if (reply === null || reply.kind !== 'export:download_result' || !reply.ok) {
    throw new Error('DOWNLOAD_REFUSED')
  }
}
