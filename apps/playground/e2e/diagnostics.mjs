/**
 * What to print when a ring fails.
 *
 * A failed `waitForSelector` says which selector never appeared; it never says why. Since
 * the harness drives a process it does not own (a browser with an extension in it), the
 * useful additions are: what the recorder was asked for, what the surfaces actually say,
 * and whether the page raised anything.
 */
export async function dumpDiagnostics(ctx) {
  console.log('\n--- recorded model ---')
  console.log(JSON.stringify(await ctx.harness.state().catch(() => null)))

  console.log('--- surfaces ---')
  for (const [label, selector] of [
    ['build panel', '.jx-panel'],
    ['run panel', '.jx-run-panel'],
    ['stream', '.jx-stream'],
    ['options', 'body'],
  ]) {
    const locator = ctx.page.locator(selector).first()
    const visible = await locator.isVisible().catch(() => false)
    const text = visible ? await locator.innerText().catch(() => '') : '(not visible)'
    console.log(`${label}: ${text.replace(/\s+/g, ' ').slice(0, 700)}`)
  }

  console.log('--- page errors ---')
  const errors = ctx.logs ?? []
  console.log(errors.length === 0 ? '(none)' : errors.slice(-8).join('\n'))
}
