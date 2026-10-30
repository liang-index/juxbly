// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { exportCapability } from '@juxbly/capabilities'
import { createHarness, makeTool, productExtractStep, runOnce, type Harness } from './harness'

/**
 * No `export` step is ever delivered by a run — `task/stage-1-15.md` AC 5 for `copy`,
 * extended to `csv` and `json` by Maintainer ruling 2026-09-22, `docs/ARCHITECTURE.md` §5.2.
 *
 * The rule is not a nicety. A tool that auto-runs on page load is the case where nobody is
 * watching: `copy` overwrites whatever the user had on the clipboard, and `csv` / `json`
 * drop a file into the download manager with nothing on screen that says so — which, at the
 * field-level accuracy the benchmark currently measures, is a *silent* wrong artefact rather
 * than a visible wrong table. The panel's Copy / CSV / JSON buttons are the sanctioned path
 * and never go through a step, so an export step reaching the engine is unattended by
 * definition. This test is what stops a later refactor from turning the header comment back
 * into a claim that nothing enforces.
 *
 * The refusal is placed before `input_from` is resolved, but that ordering is belt-and-braces
 * rather than observable from here: `packages/dsl/src/validate.ts` already rejects an
 * `input_from` that no earlier step produces, so a dangling export fails validation before
 * the engine ever sees it.
 */

/** `export` is 1-15's capability; the shared harness deliberately leaves it unregistered. */
function harnessWithExport(): Harness {
  const harness = createHarness()
  harness.registry.register(exportCapability)
  return harness
}

describe('an unattended run delivers no export', () => {
  it.each(['copy', 'csv', 'json'] as const)('refuses an export step in the %s format', async (format) => {
    const harness = harnessWithExport()
    const clipboard = vi.spyOn(harness.ports.clipboard, 'writeText')
    const download = vi.spyOn(harness.ports.downloads, 'download')
    const tool = makeTool([productExtractStep(), { type: 'export', format, input_from: 'products' }])

    const outcome = await runOnce(harness, { tool })

    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('CAPABILITY_FAILED')
    expect(outcome.error?.step).toBe(1)
    expect(clipboard).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })

  it('still runs the same tool once the export step is gone', async () => {
    // The control: the refusal is about `export`, not about the engine rejecting steps.
    const harness = harnessWithExport()
    const clipboard = vi.spyOn(harness.ports.clipboard, 'writeText')
    const download = vi.spyOn(harness.ports.downloads, 'download')
    const tool = makeTool([productExtractStep()])

    const outcome = await runOnce(harness, { tool })

    expect(outcome.ok).toBe(true)
    expect(clipboard).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  })
})
