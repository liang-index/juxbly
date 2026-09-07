import { mountView } from '@juxbly/ui'
import type { ViewName, ViewProps } from '@juxbly/ui'

/**
 * Where a rendered result is allowed to go: `RuntimePorts.dom.mountPoint()`, which is
 * always inside Juxbly's own Shadow DOM (`docs/ARCHITECTURE.md` §6.1, UI_SPEC §11).
 *
 * Nothing else is written to — not the host page, not `document.body`. A tool that renders
 * into the page it extracted from would be indistinguishable from the page breaking, and
 * the host page's own CSS would restyle it within a deploy.
 */
export function mountRenderedView(
  view: ViewName,
  props: ViewProps,
  container: HTMLElement,
): void {
  mountView(view, props, container)
}
