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
  createReactRoot(container).render(app)
}

/**
 * The same root setup, with the render handle handed back. Needed by the surfaces that
 * are *re-opened* with different props — a repair opens the build panel over an existing
 * tool, and re-rendering is the only way to give a mounted panel that context.
 */
export function createReactRoot(container: HTMLElement): {
  render(app: ReactNode): void
  unmount(): void
} {
  const root = createRoot(container)
  return {
    render(app: ReactNode): void {
      root.render(
        <StrictMode>
          {app}
        </StrictMode>,
      )
    },
    unmount(): void {
      root.unmount()
    },
  }
}
