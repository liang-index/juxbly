// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createHarness, makeTool, productExtractStep, runOnce, summarizeStep } from './harness'

/**
 * Cancellation (§6.1): the panel closes, or the page navigates, while a run is in flight.
 *
 * The contract is not "stop cleanly" — it is that a cancelled run leaves **no state
 * behind**. A half-finished run that wrote a cache entry would make the next run reuse an
 * answer from a run that never completed.
 */
describe('cancelling a run', () => {
  it('stores nothing and does not throw when cancelled mid-run', async () => {
    const controller = new AbortController()
    const harness = createHarness({
      // Cancel from inside the model call — the realistic moment, since it is the only
      // step that can still be in flight after the panel is gone.
      handler: () => {
        controller.abort()
        return 'too late'
      },
    })
    const tool = makeTool([productExtractStep(), summarizeStep()])

    const outcome = await runOnce(harness, { tool, signal: controller.signal })

    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('ABORTED')
    // No state: the next run must start from the previous run's, not from this one's.
    expect(outcome.runState).toBeUndefined()
    expect(outcome.outputs).toEqual({ products: expect.anything() })
  })

  it('never starts a run that is already cancelled', async () => {
    const harness = createHarness({ output: 'ok' })
    harness.controller.abort()

    const outcome = await runOnce(harness, { tool: makeTool([productExtractStep(), summarizeStep()]) })

    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('ABORTED')
    expect(outcome.runState).toBeUndefined()
    expect(harness.llm.calls).toHaveLength(0)
  })

  it('reports a capability that throws as a failure with a known code, not as a crash', async () => {
    const harness = createHarness({ error: new Error('endpoint said no') })
    const outcome = await runOnce(harness, { tool: makeTool([productExtractStep(), summarizeStep()]) })

    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('CAPABILITY_FAILED')
    // A capability's own message is never forwarded: it can contain page content.
    expect(outcome.error?.message).not.toContain('endpoint said no')
  })

  it('refuses a step type nothing implements', async () => {
    const harness = createHarness({ output: 'ok' })
    // `export` lands in 1-15, so an unregistered registry must say so rather than skip it.
    const tool = makeTool([productExtractStep(), { type: 'export', format: 'json', input_from: 'products' }])

    const outcome = await runOnce(harness, { tool })

    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('CAPABILITY_UNREGISTERED')
    expect(outcome.error?.step).toBe(1)
  })
})
