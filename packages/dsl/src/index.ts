/**
 * `@juxbly/dsl` — Tool DSL types, schema validation and url_pattern matching.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Type contracts: §5.1 / §5.2; matching
 * semantics: §5.3; validation rules: §5.4. Pure functions only — no platform access,
 * no side effects. `ValidationResult` / `ValidationError` live in `@juxbly/core`
 * (§5.5) and are re-exported here only as types for convenience.
 */
export type {
  ConditionOp,
  ExportStep,
  ExtractStep,
  FieldType,
  FilterCondition,
  LlmStep,
  LlmTask,
  PreScroll,
  RenderStep,
  ToolCategory,
  ToolDefinition,
  ToolStep,
  TransformOp,
  TransformStep,
} from './types'

export { parseUrlPattern, UrlPatternError } from './url-pattern'
export type { UrlPattern } from './url-pattern'

export { matchUrl } from './match-url'

export { checkRegexSafety, isSafeRegex } from './safe-regex'
export type { SafeRegexCheck } from './safe-regex'

export { validateToolDefinition } from './validate'

export type { ValidationResult, ValidationError } from '@juxbly/core'
