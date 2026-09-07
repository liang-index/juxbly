/**
 * The variable bag — where a step's `output_to` lands and where the next step's
 * `input_from` reads it from (stage 1-7, `docs/ARCHITECTURE.md` §9.2).
 *
 * Two rules, both already enforced by `validateToolDefinition` (§5.4) and both repeated
 * here as a fence rather than an assumption:
 *
 * - a name may be produced **once** — two steps writing the same variable would make the
 *   meaning of that variable depend on which ran last;
 * - a step may only read what an **earlier** step wrote — V1 runs linearly, so a forward
 *   reference is a broken tool, not an empty value.
 *
 * The fence is why the bag throws instead of returning `undefined`: silently continuing
 * with `undefined` is how a broken tool turns into a wrong answer the user has to notice.
 */
export type VariableErrorCode = 'VARIABLE_DUPLICATE' | 'VARIABLE_UNRESOLVED' | 'VARIABLE_NOT_RECORDS'

export class VariableBagError extends Error {
  readonly code: VariableErrorCode

  constructor(code: VariableErrorCode, message: string) {
    super(message)
    this.name = 'VariableBagError'
    this.code = code
  }
}

/** What a step hands the next one: a list of flat records. */
export type VariableRecords = readonly Record<string, unknown>[]

export class VariableBag {
  private readonly values = new Map<string, unknown>()

  /** Writes a step's output. Throws if the name was already produced by another step. */
  set(name: string, value: unknown): void {
    if (this.values.has(name)) {
      throw new VariableBagError(
        'VARIABLE_DUPLICATE',
        `"${name}" is already produced by an earlier step`,
      )
    }

    this.values.set(name, value)
  }

  /** Reads a variable. Throws rather than returning `undefined` for an unknown name. */
  get(name: string): unknown {
    if (!this.values.has(name)) {
      throw new VariableBagError('VARIABLE_UNRESOLVED', `"${name}" is not produced by an earlier step`)
    }

    return this.values.get(name)
  }

  has(name: string): boolean {
    return this.values.has(name)
  }

  /**
   * Reads a variable as the record list a capability consumes.
   *
   * `extract` stores its whole `ExtractResult`, a `transform` stores a plain array: both
   * are "the rows", and unwrapping here keeps that difference out of every consumer.
   */
  records(name: string): VariableRecords {
    const rows = asRecords(this.get(name))

    if (rows === undefined) {
      throw new VariableBagError('VARIABLE_NOT_RECORDS', `"${name}" is not a list of records`)
    }

    return rows
  }

  /** Everything produced so far — what `RunOutcome.outputs` reports. */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values)
  }
}

/** `undefined` when the value is not a record list at all. */
export function asRecords(value: unknown): VariableRecords | undefined {
  const rows = Array.isArray(value) ? value : isExtractResult(value) ? value.items : undefined
  if (rows === undefined) return undefined

  for (const row of rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined
  }

  return rows as VariableRecords
}

/**
 * `extract` wraps its rows in a result that also carries presence counts and hit counts
 * (§5.5) — the rows are what flows onward, the rest is health's.
 */
function isExtractResult(value: unknown): value is { items: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray((value as { items?: unknown }).items)
  )
}
