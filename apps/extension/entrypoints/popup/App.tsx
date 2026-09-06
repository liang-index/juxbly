import { copy } from '@juxbly/ui/copy'

/**
 * Placeholder popup (stage 0-3). The real content — tools matching the current page —
 * lands later; user-visible strings come from `packages/ui/src/copy`, never inline.
 */
export function App() {
  return (
    <main>
      <h1>{copy.popup.heading}</h1>
      <p>{copy.popup.body}</p>
    </main>
  )
}
