import { t } from '../copy'

/**
 * The promise line — `docs/PRODUCT.md` §3.5.4, `docs/UI_SPEC.md` §7.3 segment ④.
 *
 * The first build's Remember step is invisible: the user describes a need and gets a
 * result, and nothing has told them the result will come back on its own. This line is
 * that sentence, once. After `first_tool_built` it shrinks to a statement of fact —
 * repeating the full explanation forever would turn a promise into a nag.
 */
export interface PromiseLineProps {
  firstToolBuilt: boolean
}

export function PromiseLine({ firstToolBuilt }: PromiseLineProps) {
  return (
    <p className="jx-run-line jx-run-line--promise">
      {t(firstToolBuilt ? 'run.promise.recurring' : 'run.promise.first')}
    </p>
  )
}
