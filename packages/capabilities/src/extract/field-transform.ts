/**
 * Applying a field's post-read transform pipeline — `docs/ARCHITECTURE.md` §5.2
 * `field_transforms`.
 *
 * Semantics deliberately mirror the `regex` transform op (`../transform/regex.ts`): a
 * failed match reads `''`, not an error — "the wrapper was not found" and "the field was
 * not there" lead to the same repair conversation, and both are values `fieldPresence`
 * already understands. The value stays page content: capture keeps a substring of what
 * was read, it never parses structure and never writes.
 *
 * The safety check runs once per step (`assertTransformPatternsSafe`), not once per row:
 * validation (§5.4) already stops an unsafe pattern before any run, but a capability is
 * callable directly without validation, and the one place a catastrophic pattern can be
 * refused is before the first `new RegExp`.
 */
import type { ExtractStep, FieldTransform } from '@juxbly/dsl'
import { checkRegexSafety } from '@juxbly/dsl'
import { CapabilityError } from '../errors'
import type { FieldValue } from './field-value'

/**
 * Re-runs the §5.4 rule the validator enforces, so a step that arrived without passing
 * through `validateToolDefinition` still cannot run a ReDoS pattern. One throw covers the
 * whole step; the error names the field, which is what the repair flow prefills.
 */
export function assertTransformPatternsSafe(step: ExtractStep): void {
  for (const [name, pipeline] of Object.entries(step.field_transforms ?? {})) {
    for (const transform of pipeline ?? []) {
      if (transform.op !== 'capture') continue
      const safety = checkRegexSafety(transform.pattern)
      if (!safety.safe) {
        throw new CapabilityError(
          'REGEX_UNSAFE',
          `unsafe regular expression in field_transforms.${name}: ${safety.reason}`,
        )
      }
    }
  }
}

/**
 * Applies one field's pipeline in order. A value that is not a string — `image`'s
 * `{src, alt}` — passes through untouched: validation refuses transforms on image fields,
 * and a runtime no-op is the honest fallback for a step that arrived without validation.
 */
export function applyFieldTransforms(value: FieldValue, transforms: readonly FieldTransform[]): FieldValue {
  let current: FieldValue = value
  for (const transform of transforms) {
    if (typeof current !== 'string') break
    current = capture(current, transform)
  }
  return current
}

function capture(value: string, { pattern, group }: FieldTransform): string {
  const match = new RegExp(pattern).exec(value)
  if (match === null) return ''
  // An out-of-range group is "no match", not a crash — the pattern is the model's output,
  // and a tool must degrade the same way the regex transform op degrades.
  return match[group ?? 0] ?? ''
}
