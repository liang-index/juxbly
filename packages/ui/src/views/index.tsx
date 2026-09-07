import type { ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { CardView } from './CardView'
import { TableView } from './TableView'
import { TextView } from './TextView'
import type { ViewStatus } from './ViewState'

/**
 * The three result views and the one place that mounts them.
 *
 * Views are components; mounting is not their business. Keeping the split means the same
 * components can be asserted without a DOM (render them) and mounted for real inside the
 * content script's Shadow DOM (stage 1-8) — the two paths 1-4 tests both need.
 */
export type ViewName = 'table' | 'card' | 'text'

export interface ViewProps {
  items: readonly Record<string, unknown>[]
  status?: ViewStatus
  error?: string
}

const VIEWS = {
  table: TableView,
  card: CardView,
  text: TextView,
} as const

export function renderView(view: ViewName, props: ViewProps): ReactElement {
  const Component = VIEWS[view]
  return <Component {...props} />
}

/**
 * One root per container, cached: switching views in the run panel re-renders into the
 * same host (UI_SPEC §7.1 — a view switch must never re-run extract or llm), and creating
 * a second root on a container React already owns is a warning and a leak.
 *
 * `flushSync` on purpose. The result panel is a small, cheap view, and "the run finished
 * but the panel is blank for a frame" is exactly the kind of flicker that reads as a bug.
 * A synchronous commit also makes a view switch atomic for whoever is watching it — and
 * keeps the render path deterministic in tests.
 */
const roots = new WeakMap<HTMLElement, Root>()

export function mountView(view: ViewName, props: ViewProps, container: HTMLElement): void {
  let root = roots.get(container)
  if (root === undefined) {
    root = createRoot(container)
    roots.set(container, root)
  }

  flushSync(() => {
    root?.render(renderView(view, props))
  })
}

export { CardView } from './CardView'
export { TableView } from './TableView'
export { TextView } from './TextView'
export { ViewStatusNote } from './ViewState'
export type { ViewStatus } from './ViewState'
export { MAX_ROWS, MAX_VALUE_CHARS, collectFields, formatValue, limitRows, safeHref, truncateValue } from './value'
