import type { ValidationError } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CommandRegistry } from '../commands/registry'
import { t } from '../copy'
import { CapabilitySummary } from './capability-summary'
import { parseDraft, stringifyDefinition } from './config-draft'
import type { RunMessagingPorts } from './ports'
import { VersionSection } from './version-section'

/**
 * The config tab — `task/stage-1-16.md` Scope 2 / 4 / 6, `docs/UI_SPEC.md` §10.
 *
 * Hand-editing the definition, in a panel that a saved tool opens on its own. Three
 * things make that safe enough to ship, and each one is load-bearing:
 *
 * - **Saving is a new version, never an overwrite.** The port sends an explicit repair
 *   request precisely because a bare `build:save_tool` *merges* into the record it finds,
 *   which would rewrite the definition in place (PRODUCT §12).
 * - **The draft goes through `validateToolDefinition` before it goes anywhere** — the
 *   same gate the model's output goes through, because hand-written DSL is the likelier
 *   source of an unknown field or an unknown `type` (§5.4 rule 8).
 * - **No AI re-check.** The edit is the user's; a second opinion from the model would be
 *   a silent rewrite of it (§12.7).
 *
 * The edit is restricted to the allowlisted capabilities by construction: the DSL has no
 * code, and anything outside it fails validation. A JS sandbox is explicitly not built
 * here (§10 records it as a possible future "advanced mode" for the Store build).
 */
export interface ConfigTabProps {
  tool: ToolDefinition
  ports: Pick<RunMessagingPorts, 'saveEdit' | 'loadVersions' | 'rollback'>
  commands: CommandRegistry
  versionsOpen: boolean
  onToggleVersions(): void
  /** Fired once a save wrote a new version; the caller adopts it and runs it. */
  onSaved(version: number, definition: ToolDefinition): void
  onRolledBack(version: number): void
}

export function ConfigTab({
  tool,
  ports,
  commands,
  versionsOpen,
  onToggleVersions,
  onSaved,
  onRolledBack,
}: ConfigTabProps): ReactNode {
  const [draft, setDraft] = useState(() => stringifyDefinition(tool))
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [errors, setErrors] = useState<readonly ValidationError[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // A new version in effect is a new starting point: the draft follows the tool it
  // edits, and stale errors from the previous definition must not survive it.
  useEffect(() => {
    setDraft(stringifyDefinition(tool))
    setJsonError(null)
    setErrors(null)
  }, [tool])

  // The summary reads the draft when it parses, so an edit shows its own consequences
  // before it is saved. Nothing is executed to produce it — it is a static read.
  const previewed = useMemo(() => {
    const parsed = parseDraft(draft)
    return parsed.ok ? parsed.definition : tool
  }, [draft, tool])

  const save = (): void => {
    const parsed = parseDraft(draft)
    if (!parsed.ok) {
      // The draft stays exactly as it was typed: losing an edit to a typo is the one
      // failure this surface must never add to the one it is reporting.
      setErrors(parsed.reason === 'invalid_definition' ? parsed.errors : null)
      setJsonError(parsed.reason === 'invalid_json' ? parsed.message : null)
      setNote(null)
      return
    }

    setErrors(null)
    setJsonError(null)
    setSaving(true)
    setNote(null)
    void ports.saveEdit({ toolId: tool.tool_id, tool: parsed.definition }).then((reply) => {
      setSaving(false)
      if (!reply.ok) {
        setNote({ tone: 'error', text: t('run.config.failed') })
        return
      }
      const version = reply.version ?? parsed.definition.version
      setNote({ tone: 'ok', text: t('run.config.saved', { version }) })
      onSaved(version, parsed.definition)
    })
  }

  const invalid = jsonError !== null || errors !== null

  return (
    <div className="jx-config">
      <p className="jx-config-note">{t('run.config.note')}</p>

      <div className="jx-cmds" role="group" aria-label={t('run.commands.aria')}>
        {commands.all().map((command) => (
          <button
            key={command.name}
            type="button"
            className="jx-cmd"
            onClick={() => commands.match(command.name)?.run()}
          >
            {command.name}
          </button>
        ))}
      </div>

      <textarea
        className={invalid ? 'jx-editor is-invalid' : 'jx-editor'}
        aria-label={t('run.config.editor_aria')}
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />

      <ConfigErrors jsonError={jsonError} errors={errors} />

      <div className="jx-config-buttons">
        <button type="button" className="jx-chip" disabled={saving} onClick={save}>
          {saving ? t('run.config.saving') : t('run.config.save')}
        </button>
        <button
          type="button"
          className="jx-link"
          disabled={saving}
          onClick={() => setDraft(stringifyDefinition(tool))}
        >
          {t('run.config.revert')}
        </button>
      </div>

      {note === null ? null : (
        <p className="jx-config-feedback" data-tone={note.tone}>
          {note.text}
        </p>
      )}

      <CapabilitySummary tool={previewed} />

      <VersionSection
        ports={ports}
        toolId={tool.tool_id}
        activeVersion={tool.version}
        open={versionsOpen}
        onToggle={onToggleVersions}
        onRolledBack={onRolledBack}
      />
    </div>
  )
}

/** Field-level reasons, or the parser's own message — never a bare "could not save". */
function ConfigErrors({
  jsonError,
  errors,
}: {
  jsonError: string | null
  errors: readonly ValidationError[] | null
}): ReactNode {
  if (jsonError !== null) {
    return (
      <p className="jx-config-error" data-testid="config-error">
        {t('run.config.invalid_json')} <span className="jx-config-reason">{jsonError}</span>
      </p>
    )
  }

  if (errors === null) return null

  return (
    <div className="jx-config-error" data-testid="config-error">
      <p className="jx-config-error-head">{t('run.config.rejected')}</p>
      <ul className="jx-config-reasons">
        {errors.map((error) => (
          <li key={`${error.path}-${error.code}`}>
            <code>{error.path}</code>
            <span className="jx-config-reason">{error.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
