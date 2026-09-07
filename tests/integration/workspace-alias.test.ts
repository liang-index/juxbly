import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import { analyzePage } from '@juxbly/analyzer'
import { validateToolDefinition } from '@juxbly/dsl'

/**
 * Acceptance criterion for stage 0-2: the `@juxbly/*` path alias must resolve in the
 * test runner the same way it resolves in `tsc`. Two resolution strategies defined in
 * two places would drift, so this test exists to catch that drift early.
 *
 * Stage 1-1 gave `packages/dsl` real exports and stage 1-2 / 1-3 gave `packages/analyzer`
 * and `packages/browser` theirs, so the alias check now asserts one of each instead of
 * the skeleton placeholder.
 */
describe('workspace path aliases', () => {
  it('resolves @juxbly/* to the package source entry', () => {
    expect(typeof validateToolDefinition).toBe('function')
    expect(typeof analyzePage).toBe('function')
    expect(typeof createMockAdapter).toBe('function')
  })
})
