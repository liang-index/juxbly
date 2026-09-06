/**
 * Placeholder for commands whose owning stage has not landed yet (stage 0-2).
 *
 * Usage: node scripts/stage-placeholder.mjs <stage-id>
 *
 * Failing loudly is deliberate: a silently green command would make contributors
 * believe the underlying capability already exists.
 */
const stage = process.argv[2]

if (!stage) {
  console.error('[JUXBLY] stage-placeholder: missing stage argument.')
  process.exit(1)
}

console.error(`[JUXBLY] this command is not available yet — it lands in stage ${stage}.`)
process.exit(1)
