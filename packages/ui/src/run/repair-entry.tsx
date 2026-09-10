import type { ToolDefinition } from '@juxbly/dsl'
import { fromHealth, fromUserEdit } from '@juxbly/repair'
import type { ReactNode } from 'react'
import type { BuildRepair } from '../build/BuildPanel'
import { t } from '../copy'
import type { RunHealthVerdict } from './ports'

/**
 * The repair entry — `task/stage-1-12.md` Scope 1, `docs/ARCHITECTURE.md` §9.3.
 *
 * Both triggers into the repair flow are built here, because the difference between them
 * is the whole of the design and it must not be re-decided in three places:
 *
 * - **a breakage** opens with the context message already written — what was observed, the
 *   likely cause, a next step. The product has just told the user the tool is broken;
 *   dropping them into an empty box would make them retype that.
 * - **a rework** opens with nothing. The tool may be working perfectly — the user may just
 *   want different fields. Claiming a breakage there would be an assertion the product has
 *   no evidence for, and `ever_broken` is a fact, not a mood.
 *
 * Everything after the entry is identical: analyse, propose, highlight, confirm, new
 * version. A repair is not a special mode; it is the build flow with the first turn
 * already written.
 */

/** The three pieces `packages/repair` splices into the preset context message (§9.3). */
export interface RepairContextCopy {
  observed: string
  cause: string
  next: string
}

/**
 * The words of the preset message. They live here, not in `packages/repair`, because
 * UI_SPEC §9.5 keeps every user-visible string in the copy bundle; the repair engine only
 * assembles them (and can therefore be tested without React).
 */
export function repairContextCopy(): RepairContextCopy {
  return {
    observed: t('run.repair.context.observed'),
    cause: t('run.repair.context.cause'),
    next: t('run.repair.context.next'),
  }
}

/** The version a repair starts from is the one in effect — the one it replaces (§8.1). */
function targetOf(tool: ToolDefinition): { toolId: string; version: number } {
  return { toolId: tool.tool_id, version: tool.version }
}

/** A breakage-triggered repair: the context message is written for the user. */
export function repairFromHealth(tool: ToolDefinition, verdict: RunHealthVerdict): BuildRepair {
  return {
    request: { toolId: tool.tool_id, trigger: 'broken', note: t('run.repair.note_broken') },
    session: fromHealth(targetOf(tool), verdict, repairContextCopy()),
  }
}

/** A user-initiated rework: same flow, no preset, no breakage claimed. */
export function repairFromUser(tool: ToolDefinition): BuildRepair {
  return {
    request: { toolId: tool.tool_id, trigger: 'user', note: t('run.repair.note_edit') },
    session: fromUserEdit(targetOf(tool)),
  }
}

export interface RepairEntryProps {
  /** The CTA's wording: "Fix this tool" for a breakage, "Change what it collects" for a rework. */
  label: string
  onStart(): void
  disabled?: boolean
}

/**
 * §7: a primary action is disabled while its own work is out, so a second click cannot
 * open two build flows over the same tool.
 */
export function RepairEntry({ label, onStart, disabled }: RepairEntryProps): ReactNode {
  return (
    <div className="jx-repair-entry">
      <button
        type="button"
        className="jx-chip"
        disabled={disabled === true}
        onClick={onStart}
      >
        {label}
      </button>
    </div>
  )
}
