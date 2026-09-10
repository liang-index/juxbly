/**
 * `validateToolDefinition` — `docs/ARCHITECTURE.md` §5.4, all nine rules.
 *
 * This function is the only gate between LLM output (or user edits) and execution: it
 * runs both before saving and before every run. It is a pure function — no side
 * effects, no platform access — so the same call guards both paths (1-1 Interfaces).
 *
 * Rejection, never degradation: unknown types and unknown fields are hard errors
 * (§5.4 rule 8, the mechanism that keeps the DSL from quietly growing). Every error
 * carries a field-level `path`, a stable `code` and an English `message`.
 *
 * The result shape is the discriminated union defined in `docs/ARCHITECTURE.md` §5.5
 * (E3) — the single authoritative definition, not redeclared here.
 */
import type { ValidationError, ValidationResult } from '@juxbly/core'
import { isFragileSelector } from '@juxbly/core'
import type { ToolDefinition } from './types'
import { checkRegexSafety } from './safe-regex'
import { parseUrlPattern } from './url-pattern'

/** Every field the §5.1 ToolDefinition may carry. Anything else is rule 8. */
const TOP_LEVEL_FIELDS: readonly string[] = [
  'tool_id',
  'name',
  'description',
  'category',
  'url_pattern',
  'version',
  'steps',
  'created_at',
  'updated_at',
]

/**
 * Every field each §5.2 step type may carry. `render` and `export` deliberately have
 * no `output_to` (rule 3) — their field lists exclude it, and the dedicated
 * `CONSUMER_HAS_OUTPUT_TO` code reports it with the right semantics.
 */
const STEP_FIELDS: Record<string, readonly string[]> = {
  extract: ['type', 'mode', 'selector', 'fields', 'field_types', 'pre_scroll', 'output_to'],
  transform: ['type', 'op', 'input_from', 'output_to', 'condition', 'field', 'order', 'pattern', 'group'],
  llm: ['type', 'task', 'input_from', 'output_to', 'prompt', 'target_lang'],
  render: ['type', 'view', 'input_from'],
  export: ['type', 'format', 'input_from'],
}

const CONDITION_OPS: readonly string[] = [
  '>',
  '>=',
  '<',
  '<=',
  '==',
  '!=',
  'contains',
  'starts_with',
  'ends_with',
  'matches',
]

const LLM_TASKS: readonly string[] = ['summarize', 'translate', 'classify', 'sentiment', 'custom']

const PRODUCER_TYPES: readonly string[] = ['extract', 'transform', 'llm']

export function validateToolDefinition(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { ok: false, errors: [err('', 'NOT_AN_OBJECT', 'a tool definition must be a JSON object')] }
  }

  const errors: ValidationError[] = []
  const def = input

  // Rule 8 (top level): unknown fields.
  for (const key of Object.keys(def)) {
    if (!TOP_LEVEL_FIELDS.includes(key)) {
      errors.push(err(key, 'UNKNOWN_FIELD', `unknown field "${key}"`))
    }
  }

  // Shape of the required scalars (§5.1).
  const toolId = def['tool_id']
  if (typeof toolId !== 'string' || toolId.trim() === '') {
    errors.push(err('tool_id', 'TOOL_ID_INVALID', 'tool_id must be a non-empty string'))
  }

  const name = def['name']
  if (typeof name !== 'string' || name.trim() === '') {
    errors.push(err('name', 'NAME_INVALID', 'name must be a non-empty string'))
  }

  const category = def['category']
  if (category !== 'data' && category !== 'enhance' && category !== 'analyze' && category !== 'export') {
    errors.push(err('category', 'CATEGORY_UNKNOWN', 'category must be one of data | enhance | analyze | export'))
  }

  const version = def['version']
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    errors.push(err('version', 'VERSION_INVALID', 'version must be an integer >= 1'))
  }

  for (const field of ['created_at', 'updated_at'] as const) {
    const value = def[field]
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      errors.push(err(field, 'TIMESTAMP_INVALID', `${field} must be an ISO 8601 timestamp`))
    }
  }

  // Rule 7: url_pattern must parse.
  const urlPattern = def['url_pattern']
  if (typeof urlPattern !== 'string' || urlPattern.trim() === '') {
    errors.push(err('url_pattern', 'URL_PATTERN_INVALID', 'url_pattern must be a non-empty string'))
  } else {
    try {
      parseUrlPattern(urlPattern)
    } catch (error) {
      errors.push(
        err('url_pattern', 'URL_PATTERN_INVALID', error instanceof Error ? error.message : 'url_pattern could not be parsed'),
      )
    }
  }

  // Rule 1 (first half): steps must be a non-empty array.
  const steps = def['steps']
  if (!Array.isArray(steps) || steps.length === 0) {
    errors.push(err('steps', 'STEPS_EMPTY', 'steps must be a non-empty array'))
    return finish(errors, input)
  }

  /**
   * Variables produced so far. Registered *after* a step's own rule-2 check, so a
   * self-reference fails and only strictly earlier steps count (V1 is linear).
   */
  const produced = new Set<string>()
  const outputOwner = new Map<string, number>()

  steps.forEach((step, index) => {
    const path = `steps[${index}]`

    if (!isRecord(step)) {
      errors.push(err(path, 'STEP_NOT_AN_OBJECT', 'each step must be a JSON object'))
      return
    }

    const type = step['type']
    if (
      type !== 'extract' &&
      type !== 'transform' &&
      type !== 'llm' &&
      type !== 'render' &&
      type !== 'export'
    ) {
      errors.push(err(`${path}.type`, 'STEP_TYPE_UNKNOWN', `unknown step type ${JSON.stringify(type)}`))
      return
    }

    // Rule 8 (per step): unknown fields; rule 3 reported with its own code.
    for (const key of Object.keys(step)) {
      if (STEP_FIELDS[type]?.includes(key)) continue
      if ((type === 'render' || type === 'export') && key === 'output_to') {
        errors.push(
          err(`${path}.output_to`, 'CONSUMER_HAS_OUTPUT_TO', 'render and export steps consume data; they declare no output_to'),
        )
        continue
      }
      errors.push(err(`${path}.${key}`, 'UNKNOWN_FIELD', `unknown field "${key}" for step type "${type}"`))
    }

    // Rule 1 (second half): output_to globally unique across producers.
    if (PRODUCER_TYPES.includes(type)) {
      const outputTo = step['output_to']
      if (typeof outputTo !== 'string' || outputTo.trim() === '') {
        errors.push(err(`${path}.output_to`, 'OUTPUT_TO_INVALID', `${type} steps must declare a non-empty output_to`))
      } else {
        const owner = outputOwner.get(outputTo)
        if (owner !== undefined) {
          errors.push(err(`${path}.output_to`, 'OUTPUT_TO_DUPLICATE', `"${outputTo}" is already produced by steps[${String(owner)}]`))
        } else {
          outputOwner.set(outputTo, index)
        }
      }
    }

    // Rule 2: input_from must reference a variable produced by a strictly earlier step.
    if (type !== 'extract') {
      const inputFrom = step['input_from']
      if (typeof inputFrom !== 'string' || inputFrom.trim() === '') {
        errors.push(err(`${path}.input_from`, 'INPUT_FROM_INVALID', `${type} steps must declare a non-empty input_from`))
      } else if (!produced.has(inputFrom)) {
        errors.push(err(`${path}.input_from`, 'INPUT_FROM_UNRESOLVED', `"${inputFrom}" is not produced by an earlier step — V1 executes steps linearly and rejects forward references`))
      }
    }

    if (type === 'extract') validateExtract(step, path, errors)
    if (type === 'transform') validateTransform(step, path, errors)
    if (type === 'llm') validateLlm(step, path, errors)
    if (type === 'render') validateRender(step, path, errors)
    if (type === 'export') validateExport(step, path, errors)

    // Register this step's production only now: rule 2 above must not see it.
    if (PRODUCER_TYPES.includes(type)) {
      const outputTo = step['output_to']
      if (typeof outputTo === 'string' && outputTo.trim() !== '') produced.add(outputTo)
    }
  })

  return finish(errors, input)
}

function validateExtract(step: Record<string, unknown>, path: string, errors: ValidationError[]): void {
  const mode = step['mode']
  if (mode !== 'single' && mode !== 'list') {
    errors.push(err(`${path}.mode`, 'EXTRACT_MODE_INVALID', 'mode must be "single" or "list"'))
  }

  const fields = step['fields']
  if (!isRecord(fields) || Object.keys(fields).length === 0) {
    errors.push(err(`${path}.fields`, 'EXTRACT_FIELDS_EMPTY', 'fields must be a non-empty object'))
  }

  if (mode === 'list') {
    const selector = step['selector']
    if (typeof selector !== 'string' || selector.trim() === '') {
      errors.push(err(`${path}.selector`, 'EXTRACT_SELECTOR_REQUIRED', 'list mode requires a container selector'))
    }
  }

  // Rule 9: no selector may anchor on a hashed class. A build hash (CSS-in-JS output)
  // changes on the site's next deploy, so a definition that passes today is guaranteed
  // to break later — rejected here rather than saved to fail on the page. Applies to the
  // container selector and to every field selector, in both modes.
  const selector = step['selector']
  if (typeof selector === 'string' && isFragileSelector(selector)) {
    errors.push(
      err(
        `${path}.selector`,
        'SELECTOR_FRAGILE',
        'the selector uses a hashed class name (build output like css-1x2y3z) that changes on the site\'s next deploy — build it from stable anchors (semantic tags, aria-*/data-* attributes, stable classes, :nth-of-type) instead',
      ),
    )
  }
  if (isRecord(fields)) {
    for (const [name, value] of Object.entries(fields)) {
      if (typeof value === 'string' && isFragileSelector(value)) {
        errors.push(
          err(
            `${path}.fields.${name}`,
            'SELECTOR_FRAGILE',
            `the selector for field "${name}" uses a hashed class name (build output like css-1x2y3z) that changes on the site's next deploy — build it from stable anchors instead`,
          ),
        )
      }
    }
  }

  // Rule 4 (pre_scroll) + the field_types consistency case from the Edge Cases table.
  const preScroll = step['pre_scroll']
  if (preScroll !== undefined) {
    if (!isRecord(preScroll)) {
      errors.push(err(`${path}.pre_scroll`, 'PRE_SCROLL_INVALID', 'pre_scroll must be an object'))
    } else {
      const scrollMode = preScroll['mode']
      if (scrollMode !== 'to_bottom') {
        errors.push(err(`${path}.pre_scroll.mode`, 'PRE_SCROLL_MODE', 'pre_scroll.mode must be "to_bottom" in V1'))
      }
      const max = preScroll['max']
      if (max !== undefined && (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 10)) {
        errors.push(err(`${path}.pre_scroll.max`, 'PRE_SCROLL_MAX_RANGE', 'pre_scroll.max must be an integer between 1 and 10'))
      }
      const settle = preScroll['settle_ms']
      if (settle !== undefined && (typeof settle !== 'number' || !Number.isInteger(settle) || settle < 0 || settle > 2000)) {
        errors.push(err(`${path}.pre_scroll.settle_ms`, 'PRE_SCROLL_SETTLE_RANGE', 'pre_scroll.settle_ms must be an integer between 0 and 2000'))
      }
    }
  }

  const fieldTypes = step['field_types']
  if (fieldTypes !== undefined) {
    if (!isRecord(fieldTypes)) {
      errors.push(err(`${path}.field_types`, 'FIELD_TYPES_INVALID', 'field_types must be an object'))
    } else {
      const fieldNames = isRecord(fields) ? Object.keys(fields) : []
      for (const key of Object.keys(fieldTypes)) {
        if (!fieldNames.includes(key)) {
          errors.push(err(`${path}.field_types.${key}`, 'FIELD_TYPE_UNKNOWN_FIELD', `"${key}" is not a field of this extract step`))
        }
      }
    }
  }
}

function validateTransform(step: Record<string, unknown>, path: string, errors: ValidationError[]): void {
  const op = step['op']
  if (op !== 'filter' && op !== 'sort' && op !== 'regex' && op !== 'dedupe') {
    errors.push(err(`${path}.op`, 'TRANSFORM_OP_UNKNOWN', `unknown transform op ${JSON.stringify(op)}`))
    return
  }

  // Rule 5: op-specific parameter completeness.
  if (op === 'filter') {
    const condition = step['condition']
    if (!isRecord(condition)) {
      errors.push(err(`${path}.condition`, 'TRANSFORM_CONDITION_REQUIRED', 'filter requires a condition object'))
    } else {
      const field = condition['field']
      if (typeof field !== 'string' || field === '') {
        errors.push(err(`${path}.condition.field`, 'TRANSFORM_CONDITION_FIELD', 'condition.field must be a non-empty string'))
      }
      const conditionOp = condition['op']
      if (typeof conditionOp !== 'string' || !CONDITION_OPS.includes(conditionOp)) {
        errors.push(err(`${path}.condition.op`, 'TRANSFORM_CONDITION_OP', 'condition.op must be one of the documented ConditionOp values'))
      }
      const value = condition['value']
      if (typeof value !== 'string' && typeof value !== 'number') {
        errors.push(err(`${path}.condition.value`, 'TRANSFORM_CONDITION_VALUE', 'condition.value must be a string or a number'))
      } else if (conditionOp === 'matches') {
        // The matches operator runs a regex on field values — same ReDoS gate as rule 6.
        if (typeof value !== 'string') {
          errors.push(err(`${path}.condition.value`, 'TRANSFORM_CONDITION_VALUE', 'the matches operator requires a regex string'))
        } else {
          const safety = checkRegexSafety(value)
          if (!safety.safe) {
            errors.push(err(`${path}.condition.value`, 'REGEX_UNSAFE', `unsafe regular expression: ${safety.reason}`))
          }
        }
      }
    }
  }

  if (op === 'sort') {
    const field = step['field']
    if (typeof field !== 'string' || field === '') {
      errors.push(err(`${path}.field`, 'TRANSFORM_FIELD_REQUIRED', 'sort requires a target field'))
    }
    const order = step['order']
    if (order !== 'asc' && order !== 'desc') {
      errors.push(err(`${path}.order`, 'TRANSFORM_ORDER_REQUIRED', 'sort requires order "asc" or "desc"'))
    }
  }

  if (op === 'regex') {
    // Rule 6: the pattern must pass the safety subset.
    const pattern = step['pattern']
    if (typeof pattern !== 'string' || pattern === '') {
      errors.push(err(`${path}.pattern`, 'TRANSFORM_PATTERN_REQUIRED', 'regex requires a pattern'))
    } else {
      const safety = checkRegexSafety(pattern)
      if (!safety.safe) {
        errors.push(err(`${path}.pattern`, 'REGEX_UNSAFE', `unsafe regular expression: ${safety.reason}`))
      }
    }
    const group = step['group']
    if (group !== undefined && (typeof group !== 'number' || !Number.isInteger(group) || group < 0)) {
      errors.push(err(`${path}.group`, 'TRANSFORM_GROUP_INVALID', 'group must be a non-negative integer'))
    }
  }

  if (op === 'dedupe') {
    const field = step['field']
    if (typeof field !== 'string' || field === '') {
      errors.push(err(`${path}.field`, 'TRANSFORM_FIELD_REQUIRED', 'dedupe requires a target field'))
    }
  }
}

function validateLlm(step: Record<string, unknown>, path: string, errors: ValidationError[]): void {
  const task = step['task']
  if (typeof task !== 'string' || !LLM_TASKS.includes(task)) {
    errors.push(err(`${path}.task`, 'LLM_TASK_UNKNOWN', `task must be one of ${LLM_TASKS.join(' | ')}`))
    return
  }

  if (task === 'custom') {
    const prompt = step['prompt']
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      errors.push(err(`${path}.prompt`, 'LLM_PROMPT_REQUIRED', 'task "custom" requires a prompt'))
    }
  }
  if (task === 'translate') {
    const targetLang = step['target_lang']
    if (typeof targetLang !== 'string' || targetLang.trim() === '') {
      errors.push(err(`${path}.target_lang`, 'LLM_TARGET_LANG_REQUIRED', 'task "translate" requires target_lang'))
    }
  }
}

function validateRender(step: Record<string, unknown>, path: string, errors: ValidationError[]): void {
  const view = step['view']
  if (view !== 'table' && view !== 'card' && view !== 'text') {
    errors.push(err(`${path}.view`, 'RENDER_VIEW_INVALID', 'view must be "table", "card" or "text"'))
  }
  const inputFrom = step['input_from']
  if (typeof inputFrom !== 'string' || inputFrom === '') {
    errors.push(err(`${path}.input_from`, 'INPUT_FROM_INVALID', 'render must declare the variable it renders'))
  }
}

function validateExport(step: Record<string, unknown>, path: string, errors: ValidationError[]): void {
  const format = step['format']
  if (format !== 'copy' && format !== 'csv' && format !== 'json') {
    errors.push(err(`${path}.format`, 'EXPORT_FORMAT_INVALID', 'format must be "copy", "csv" or "json"'))
  }
  const inputFrom = step['input_from']
  if (typeof inputFrom !== 'string' || inputFrom === '') {
    errors.push(err(`${path}.input_from`, 'INPUT_FROM_INVALID', 'export must declare the variable it exports'))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function err(path: string, code: string, message: string): ValidationError {
  return { path, code, message }
}

function finish(errors: ValidationError[], input: Record<string, unknown>): ValidationResult {
  // Every field has been checked above; this cast is the one narrowing step at the end
  // of a hand-written validator, not a way around a check.
  if (errors.length === 0) return { ok: true, value: input as unknown as ToolDefinition }
  return { ok: false, errors }
}
