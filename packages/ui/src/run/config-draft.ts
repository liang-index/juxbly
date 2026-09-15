/**
 * The config tab's draft — `task/stage-1-16.md` Scope 2.
 *
 * Two gates, in this order, and both of them are the reason hand-editing is allowed at
 * all:
 *
 * 1. **JSON** — a person typing will produce invalid JSON, and "the save button did
 *    nothing" is the failure to avoid. The draft never leaves the editor when this
 *    fails (edge case: an unparseable draft keeps what was typed).
 * 2. **`validateToolDefinition`** — the same gate every LLM-produced definition goes
 *    through (§5.4). Hand-written DSL is *more* likely to be illegal than model output,
 *    not less: an unknown field or an unknown `type` is rejected here, exactly as it is
 *    on the model's output (§5.4 rule 8).
 *
 * No AI re-check happens anywhere in this path — the edit is the user's, and a second
 * opinion from the model would be a silent rewrite of it (§12.7: no silent repair).
 */
import type { ValidationError } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { validateToolDefinition } from '@juxbly/dsl'

export type DraftResult =
  | { ok: true; definition: ToolDefinition }
  | { ok: false; reason: 'invalid_json'; message: string }
  | { ok: false; reason: 'invalid_definition'; errors: readonly ValidationError[] }

export function parseDraft(text: string): DraftResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error: unknown) {
    return { ok: false, reason: 'invalid_json', message: errorText(error) }
  }

  const validation = validateToolDefinition(parsed)
  if (!validation.ok) return { ok: false, reason: 'invalid_definition', errors: validation.errors }

  return { ok: true, definition: validation.value }
}

/**
 * The editor's text. Two spaces, because the point is for a person to read it — a
 * minified one-line blob is not editable in any practical sense.
 */
export function stringifyDefinition(definition: ToolDefinition): string {
  return JSON.stringify(definition, null, 2)
}

/** The parser's own wording, which names the position — never a bare "invalid JSON". */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
