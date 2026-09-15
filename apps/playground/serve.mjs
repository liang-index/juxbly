/**
 * Serves the playground on demand (`pnpm --filter @juxbly/playground serve`).
 *
 * Useful for walking a lifecycle by hand: load `.output/chrome-mv3` in Chromium, set the
 * endpoint to the printed `/v1`, and open `/lifecycle.html` — the same steps the harness
 * automates, but at human speed and with DevTools open.
 */
import { startPlaygroundServer } from './server.mjs'

const { origin } = await startPlaygroundServer({ port: Number(process.env.PORT ?? 5173) })

console.log(`playground serving on ${origin}`)
console.log(`  lifecycle page  ${origin}/lifecycle.html`)
console.log(`  fixture pages   ${origin}/pages/`)
console.log(`  recorded model  ${origin}/v1`)
console.log('Ctrl-C to stop')
