import type { ToolDefinition, ToolStep } from '@juxbly/dsl'
import { t } from '../copy'
import type { ReactNode } from 'react'

/**
 * The capability summary — `task/stage-1-16.md` Scope 6, `docs/UI_SPEC.md` §10.
 *
 * A **static** read of the definition: nothing here runs, nothing is executed, and
 * nothing is inferred from the page. That is the point — this is the first *visible*
 * line of defence against indirect prompt injection. A tool can only do what its steps
 * declare, and the summary says out loud which of those steps leave the device.
 *
 * Two disciplines hold it together:
 *
 * - **Sensitive lines are grouped, not mixed in.** A network hop next to "reads text
 *   from this page" reads the same as reading text; separated and in `warn`, it is the
 *   one thing on the panel that stands out (§2: `warn` is the only colour allowed to).
 * - **It says when it cannot tell.** A `custom` llm instruction or a step type Juxbly
 *   does not recognise gets "cannot tell you" rather than a guess dressed as a fact
 *   (§9: no invented certainty).
 */
export type RiskReason = 'network' | 'cookie'

export interface CapabilityLine {
  /** What the step does, in one line. */
  label: string
  /** The shape of it: how many fields, which op, which format. */
  detail: string | null
  /** Present when this step leaves the device or reaches sensitive state. */
  risk?: RiskReason
}

/**
 * Which step types leave the device. A table, not a switch: adding a step type is a
 * compile error here until it is classified, which is the same discipline §6.3 applies
 * to capability permissions.
 */
const RISK: Partial<Record<ToolStep['type'], RiskReason>> = {
  llm: 'network',
}

export function scanCapabilities(tool: ToolDefinition): CapabilityLine[] {
  return tool.steps.map((step) => lineFor(step))
}

function lineFor(step: ToolStep): CapabilityLine {
  const risk = RISK[step.type]

  switch (step.type) {
    case 'extract':
      return {
        label: t('run.capability.extract'),
        detail: t('run.capability.extract_detail', { count: Object.keys(step.fields).length }),
        ...(risk === undefined ? {} : { risk }),
      }
    case 'transform':
      return {
        label: t('run.capability.transform'),
        detail: t('run.capability.transform_detail', { op: step.op }),
        ...(risk === undefined ? {} : { risk }),
      }
    case 'llm':
      return {
        label: t('run.capability.llm'),
        // A custom instruction is the one case a static scan genuinely cannot
        // summarise, and saying so is more useful than printing the task name.
        detail:
          step.task === 'custom'
            ? t('run.capability.custom')
            : t('run.capability.llm_detail', { task: step.task }),
        ...(risk === undefined ? {} : { risk }),
      }
    case 'render':
      return {
        label: t('run.capability.render'),
        detail: t('run.capability.render_detail', { view: step.view }),
        ...(risk === undefined ? {} : { risk }),
      }
    case 'export':
      return {
        label: t('run.capability.export'),
        detail: t('run.capability.export_detail', { format: step.format }),
        ...(risk === undefined ? {} : { risk }),
      }
    default:
      // Not dead and not decoration: a step type added to `ToolStep` but not to this
      // switch lands here, saying it cannot tell — which is better than printing
      // nothing and better than guessing.
      return { label: t('run.capability.unknown'), detail: null }
  }
}

/** The two groups the panel draws — sensitive last, so the eye lands on it. */
export interface CapabilityGroups {
  plain: CapabilityLine[]
  sensitive: CapabilityLine[]
}

export function groupCapabilities(lines: readonly CapabilityLine[]): CapabilityGroups {
  return {
    plain: lines.filter((line) => line.risk === undefined),
    sensitive: lines.filter((line) => line.risk !== undefined),
  }
}

export function CapabilitySummary({ tool }: { tool: ToolDefinition }): ReactNode {
  const groups = groupCapabilities(scanCapabilities(tool))

  return (
    <div className="jx-capability">
      <p className="jx-capability-heading">{t('run.capability.heading')}</p>
      <ul className="jx-capability-list">
        {groups.plain.map((line, index) => (
          <li className="jx-capability-item" key={`${index}-${line.label}`}>
            <span className="jx-capability-label">{line.label}</span>
            {line.detail === null ? null : (
              <span className="jx-capability-detail">{line.detail}</span>
            )}
          </li>
        ))}
      </ul>

      {groups.sensitive.length === 0 ? null : (
        <div className="jx-capability-sensitive">
          <p className="jx-capability-heading">{t('run.capability.sensitive')}</p>
          <ul className="jx-capability-list">
            {groups.sensitive.map((line, index) => (
              <li
                className="jx-capability-item jx-capability-item--risk"
                key={`${index}-${line.label}`}
                data-risk={line.risk}
              >
                <span className="jx-capability-label">{line.label}</span>
                <span className="jx-capability-detail">
                  {line.risk === 'cookie'
                    ? t('run.capability.cookie')
                    : t('run.capability.network')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="jx-capability-caveat">{t('run.capability.caveat')}</p>
    </div>
  )
}
