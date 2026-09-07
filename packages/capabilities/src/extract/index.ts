/**
 * The `extract` capability — `docs/ARCHITECTURE.md` §5.2 / §6.1 / §6.3.
 *
 * This is the capability the whole product lives or dies on: the M0 review measured
 * 42.2% of runs as wrong, and selector trouble was the single largest cause. So the
 * contract it has to hold is not "return rows" — it is **tell the truth about what the
 * selector did**. Two rules follow from that and are asserted in tests:
 *
 * - An invalid selector and a selector that matched nothing are different outcomes. The
 *   first throws (`SELECTOR_SYNTAX`), the second returns `hitCount: 0`. Health treats
 *   them as different layers (§10), and collapsing them here would make every
 *   "the page changed" look like "the tool is broken".
 * - The result carries `fieldPresence` and `missingFields` even when it looks fine, so
 *   "20 rows, all titles empty" is detectable without guessing from the row count.
 *
 * Read-only by construction: it queries and reads attributes and text. It never writes
 * the DOM, never dispatches an event, never evaluates anything — the one thing it does to
 * the page is `pre_scroll`, and that is scrolling, not acting (A1).
 */
import type { CapabilityDefinition, CapabilityInput, DomPort, ExtractResult } from '@juxbly/core'
import type { ExtractStep, PreScroll } from '@juxbly/dsl'
import { CapabilityError } from '../errors'
import { extractList, extractSingle, summarizeFields } from './modes'

/** Mirrors §5.4 rule 4: the DSL validator caps `max` at 10, so the implementation does too. */
const PRE_SCROLL_MAX_ROUNDS = 10
const PRE_SCROLL_DEFAULT_MAX = 3
const PRE_SCROLL_DEFAULT_SETTLE_MS = 400

export { MAX_ITEMS, extractList, extractSingle, summarizeFields } from './modes'
export type { ModeOutcome } from './modes'
export { MAX_SHADOW_DEPTH, classifyQueryError, queryAll } from './query'
export type { ExtractedImage, FieldValue } from './field-value'
export { emptyFieldValue, hasValue, readFieldValue } from './field-value'

/**
 * Runs one `extract` step.
 *
 * `items` of the input is ignored: `extract` is the only step that produces data without
 * consuming any (§5.2 gives it no `input_from`).
 */
export async function runExtract(
  input: CapabilityInput<ExtractStep>,
  dom: DomPort,
  signal?: AbortSignal,
): Promise<ExtractResult> {
  const { step } = input

  // Preparation before the snapshot: rows that only exist after a scroll must be in the
  // document *before* the container set is read, or the tool silently collects page one.
  if (step.pre_scroll !== undefined) {
    await runPreScroll(step.pre_scroll, dom, signal)
  }

  const outcome = step.mode === 'list' ? extractList(dom, step) : extractSingle(dom, step)
  const { fieldPresence, missingFields } = summarizeFields(outcome.records, Object.keys(step.fields))

  return {
    items: outcome.records,
    fieldPresence,
    hitCount: outcome.hitCount,
    missingFields,
    truncated: outcome.truncated,
  }
}

/**
 * A1 `pre_scroll`: scroll to the bottom so a lazy page renders the rows the tool is meant
 * to collect.
 *
 * This is DOM **preparation**, not a page action — it never clicks, never types, never
 * navigates. Clicking "load more" needs an Act capability and is out of V1; the hard cap
 * on rounds is what stops a page that grows forever from grinding the host page down
 * (§11).
 *
 * The signal is checked before and after every await: a cancelled run must not keep
 * scrolling a page its panel has already left.
 */
export async function runPreScroll(scroll: PreScroll, dom: DomPort, signal?: AbortSignal): Promise<void> {
  const max = Math.min(scroll.max ?? PRE_SCROLL_DEFAULT_MAX, PRE_SCROLL_MAX_ROUNDS)
  const settleMs = scroll.settle_ms ?? PRE_SCROLL_DEFAULT_SETTLE_MS

  for (let round = 0; round < max; round += 1) {
    throwIfAborted(signal)

    const grew = await dom.scrollToBottom()
    throwIfAborted(signal)

    // The page stopped growing: further rounds would only burn the user's time.
    if (!grew) return

    await settle(settleMs, signal)
    throwIfAborted(signal)
  }
}

export const extractCapability: CapabilityDefinition<CapabilityInput<ExtractStep>, ExtractResult> = {
  type: 'extract',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['step'],
    properties: {
      step: {
        type: 'object',
        required: ['type', 'mode', 'fields', 'output_to'],
        properties: {
          mode: { enum: ['single', 'list'] },
          selector: { type: 'string' },
          fields: { type: 'object', additionalProperties: { type: 'string' } },
          field_types: { type: 'object' },
          pre_scroll: {
            type: 'object',
            properties: { mode: { enum: ['to_bottom'] }, max: { type: 'integer' }, settle_ms: { type: 'integer' } },
          },
        },
      },
      items: { type: 'array', items: { type: 'object' } },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['items', 'fieldPresence', 'hitCount', 'missingFields'],
    properties: {
      items: { type: 'array', items: { type: 'object' } },
      fieldPresence: { type: 'object' },
      hitCount: { type: 'integer' },
      missingFields: { type: 'array', items: { type: 'string' } },
      truncated: { type: 'boolean' },
    },
  },
  // Read-only DOM access and nothing else: no network, no storage, no model, no write.
  permissions: ['dom.read'],
  securityNotes:
    'Read-only: queries the document (including open shadow roots) and reads attributes and text. Never writes the DOM, never dispatches an event, never evaluates a string. Extracted values are page content and stay opaque strings — nothing is parsed, and nothing is written to innerHTML. pre_scroll only scrolls (A1): it does not click "load more". Logs carry counts and field names only, never a value.',

  async execute(input, ctx): Promise<ExtractResult> {
    const result = await runExtract(input, ctx.ports.dom, ctx.signal)

    // Shape and counts only: these values are page content (1-5 Security).
    ctx.ports.log({
      tag: 'CAPABILITY',
      message: 'extract',
      details: [input.step.mode, result.hitCount, result.missingFields.length],
    })

    return result
  },
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new CapabilityError('ABORTED', 'the run was cancelled')
  }
}

/**
 * Waits out one settle window, waking early on abort.
 *
 * The wait is cancellable because a run is cancelled when the user closes the panel or
 * the page navigates — and a run that is over must not keep a timer alive on a page it
 * has already left.
 */
function settle(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    function onAbort(): void {
      clearTimeout(timer)
      resolve()
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
