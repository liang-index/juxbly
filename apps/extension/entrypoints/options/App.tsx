import { copy } from '@juxbly/ui/copy'

/**
 * Placeholder options page (stage 0-3). The BYOK form and the floating-ball toggle
 * belong to stage 1-13, so this is intentionally empty of controls.
 */
export function App() {
  return (
    <main>
      <h1>{copy.options.heading}</h1>
      <p>{copy.options.body}</p>
    </main>
  )
}
