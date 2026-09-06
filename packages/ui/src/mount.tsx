import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * The single place React roots are created (`docs/ARCHITECTURE.md` §4, `packages/ui`).
 *
 * Extension pages, the popup and the content-script Shadow DOM host (stage 1-8) all
 * mount through this function so the root setup — StrictMode today, error boundaries
 * and theme tokens later — has exactly one definition.
 */
export function mountReactRoot(container: HTMLElement, app: ReactNode): void {
  createRoot(container).render(
    <StrictMode>
      {app}
    </StrictMode>,
  )
}
