import type { PageAnalysis } from '@juxbly/core'
import type { BuildProposal } from './proposal'

/**
 * The inspector — `docs/UI_SPEC.md` §10: the build stage may show its intermediate
 * evidence (the page analysis and the fields about to be extracted) to whoever wants it.
 *
 * `font-mono` is allowed here and almost nowhere else (UI_SPEC §3) because this is a
 * debug view, not product copy. It is a tab rather than a panel section on purpose: the
 * person who wants it is not the person who needs it in their face.
 */
export interface InspectTabProps {
  analysis: PageAnalysis
  proposal: BuildProposal | null
}

export function InspectTab({ analysis, proposal }: InspectTabProps) {
  return (
    <div className="jx-inspect-tab">
      <pre className="jx-inspect" data-testid="analysis">
        {JSON.stringify(summarize(analysis), null, 2)}
      </pre>
      {proposal === null ? null : (
        <pre className="jx-inspect" data-testid="definition">
          {JSON.stringify(proposal.tool, null, 2)}
        </pre>
      )}
    </div>
  )
}

/**
 * Counts and names, not the visible text. The analysis carries page content; printing all
 * of it into a debug view would put page content on screen for no reason and make the
 * inspector the one place a screenshot-free product leaks text by accident.
 */
function summarize(analysis: PageAnalysis): Record<string, unknown> {
  return {
    url: analysis.url,
    title: analysis.title,
    containers: analysis.containers.map((container) => ({
      tagPath: container.tagPath,
      hitCount: container.hitCount,
      fieldHints: container.fieldHints.length,
    })),
    customElements: analysis.customElements,
    shadowHosts: analysis.shadowHosts.length,
    scrollHint: analysis.scrollHint,
    truncated: analysis.truncated,
    analyzedAt: analysis.analyzedAt,
  }
}
