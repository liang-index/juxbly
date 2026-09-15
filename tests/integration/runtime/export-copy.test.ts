// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { exportCapability } from '@juxbly/capabilities'
import { createHarness, makeTool, productExtractStep, runOnce, type Harness } from './harness'

/**
 * `export` + `format: 'copy'` is refused by the engine — `task/stage-1-15.md` AC 5,
 * `docs/ARCHITECTURE.md` §5.2.
 *
 * The rule is not a nicety. A tool that auto-runs on page load and writes the clipboard
 * would overwrite whatever the user had there, and the platform would refuse the write
 * anyway without a gesture. The panel's Copy button is the only sanctioned path to the
 * clipboard and it never goes through a step — so a `copy` step reaching the engine is
 * unattended by definition. This test is what stops a later refactor from turning the
 * header comment back into a claim that nothing enforces.
 */

/** `export` is 1-15's capability; the shared harness deliberately leaves it unregistered. */
function harnessWithExport(): Harness {
  const harness = createHarness()
  harness.registry.register(exportCapability)
  return harness
}

describe('export copy needs a user gesture', () => {
  it('refuses a copy step instead of writing the clipboard unattended', async () => {
    const harness = harnessWithExport()
    const clipboard = vi.spyOn(harness.ports.clipboard, 'writeText')
    const tool = makeTool([
      productExtractStep(),
      { type: 'export', format: 'copy', input_from: 'products' },
    ])

    const outcome = await runOnce(harness, { tool })

    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('CAPABILITY_FAILED')
    expect(outcome.error?.step).toBe(1)
    expect(clipboard).not.toHaveBeenCalled()
  })

  it('still delivers csv from the same position in the same tool', async () => {
    // The control: the refusal is about `copy`, not about `export` steps in general.
    const harness = harnessWithExport()
    const download = vi.spyOn(harness.ports.downloads, 'download')
    const tool = makeTool([
      productExtractStep(),
      { type: 'export', format: 'csv', input_from: 'products' },
    ])

    const outcome = await runOnce(harness, { tool })

    expect(outcome.ok).toBe(true)
    expect(download).toHaveBeenCalledTimes(1)
    const [filename, , mime] = download.mock.calls[0] as unknown as [string, string, string]
    expect(filename.endsWith('.csv')).toBe(true)
    expect(mime).toBe('text/csv;charset=utf-8')
  })
})
