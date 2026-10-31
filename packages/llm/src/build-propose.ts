/**
 * The background side of `build:propose` — `docs/ARCHITECTURE.md` §7.2 / §9.1.
 *
 * Why this is a package and not the entrypoint: the assembly layer may register listeners
 * and nothing else (§6.4.1). Reading the key, deciding what the model is asked, parsing
 * what comes back — all of it is business logic, and all of it lives here.
 *
 * Model output is **data**: it is parsed with `JSON.parse` and shape-checked, it is never
 * evaluated, and a candidate only becomes a `ToolDefinition` after
 * `validateToolDefinition` has accepted it in the panel (§5.4 double gate). What this
 * module adds to the draft is not judgement but *fact*: `version`, `created_at` and
 * `updated_at` are things we know and the model is only guessing at.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import { createLogger } from '@juxbly/core'
import type {
  BuildProposeMessage,
  BuildProposeResultMessage,
  ChatMessage,
  Logger,
  PageAnalysis,
} from '@juxbly/core'
import type { ExtractStep, ToolDefinition } from '@juxbly/dsl'
import { loadSettings } from '@juxbly/storage'
import { buildPrompt, buildVisionMessages, DEFAULT_SYSTEM_PROMPT, stringifyData } from './build-prompt'
import { describePage, type PageView } from './page-view'
import { callLlm, DEFAULT_API_BASE_URL, modelOrDefault } from './client'
import type { LlmFetch } from './client'
import { isLlmError } from './errors'

const log: Logger = createLogger('BUILD')

export interface BuildProposeDeps {
  fetchImpl?: LlmFetch
  logger?: Logger
  timeoutMs?: number
  /**
   * Which representation of the page the model is shown (§9.1). Absent means the shipped
   * one, so the product is unchanged; the Phase 2 benchmark passes `flat` to test whether
   * choosing from a numbered list beats composing a selector.
   */
  pageView?: PageView
  /**
   * Closed-loop repair (Round B): the model sees what its own extract step actually
   * pulled off the page and returns corrected candidates. In-process only — the wire
   * message is unchanged, exactly like `pageView`. `sampleRows` are page content and go
   * into the data section (§ red line: page content is data, never instruction).
   */
  repair?: {
    draft: ToolDefinition
    sampleRows: readonly Record<string, unknown>[]
  }
}

/** Never rejects: the panel is waiting on a reply, and a throw would look like nothing happened. */
export async function handleBuildPropose(
  message: BuildProposeMessage,
  adapter: BrowserAdapter,
  deps: BuildProposeDeps = {},
): Promise<BuildProposeResultMessage> {
  const logger = deps.logger ?? log
  const { requestId, conversation, pageAnalysis, conservative, noMoreQuestions, screenshot } = message

  const fail = (error: string): BuildProposeResultMessage => ({
    kind: 'build:propose_result',
    requestId,
    ok: false,
    error,
  })

  try {
    const settings = await loadSettings(adapter)
    const apiKey = settings?.api_key ?? ''
    // Only the key gates the flow: a blank model falls back to `DEFAULT_MODEL` at the
    // request, so a saved key always has something to run against (see `client.ts`).
    if (apiKey.trim() === '') return fail('NOT_CONFIGURED')

    const view = deps.pageView ?? 'summary'
    const repair = deps.repair
    const instruction = buildInstruction({
      conversation,
      pageAnalysis,
      conservative: conservative === true,
      noMoreQuestions: noMoreQuestions === true,
      view,
      ...(repair === undefined ? {} : { repair: true }),
    })

    const pageData = describePage(pageAnalysis, view)
    // The dry-run observation rides in the data section next to the page: it is page
    // content the model must read as data, never as instruction.
    const data =
      repair === undefined
        ? pageData
        : { page: pageData, dryRun: describeDryRun(repair.draft, repair.sampleRows) }

    const messages =
      typeof screenshot === 'string' && screenshot !== ''
        ? buildVisionMessages(screenshot, instruction)
        : buildPrompt({
            system: DEFAULT_SYSTEM_PROMPT,
            instruction,
            data: stringifyData(data),
          })

    const request = {
      endpoint: {
        baseUrl: settings?.api_base_url ?? DEFAULT_API_BASE_URL,
        apiKey,
        model: modelOrDefault(settings?.model),
      },
      messages,
      responseFormat: 'json',
      ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
    } as const
    const clientDeps = { ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }), logger }

    let response = await callLlm(request, clientDeps)
    // Live endpoints occasionally return a completion with no content at all — the
    // 2026-10-31 gate reading lost 3 of 56 cases to it, all transient (the same case
    // built fine seconds later). One retry, and only on an empty reply: a reply that
    // parsed but offered no candidates is the model's decision, not a transport fault.
    if (typeof response.output !== 'object' || response.output === null) {
      response = await callLlm(request, clientDeps)
    }

    const reply = readReply(response.output, new Date().toISOString())
    // A reply we could not read is a failure, not an empty success: `ok` is what the panel
    // branches on, and "the model came back but said nothing usable" has to take the same
    // path as a request that never went out.
    if ('error' in reply) return fail(reply.error)

    return {
      kind: 'build:propose_result',
      requestId,
      ok: true,
      ...('candidates' in reply ? { candidates: resolveRefs(reply.candidates, pageAnalysis, view) } : reply),
      usage: response.usage,
    }
  } catch (error: unknown) {
    return fail(isLlmError(error) ? error.code : 'INVALID_RESPONSE')
  }
}

/**
 * The model's JSON becomes one of two answers: a clarification question, or a list of
 * candidates. Anything else is a failure with a code the panel can explain — never a cast
 * that turns garbage into a tool.
 */
function readReply(
  output: unknown,
  now: string,
): { reply: ChatMessage } | { candidates: ToolDefinition[] } | { error: string } {
  if (typeof output !== 'object' || output === null) return { error: 'EMPTY_REPLY' }
  const parsed = output as Record<string, unknown>

  const clarification = parsed['clarification']
  if (typeof clarification === 'string' && clarification.trim() !== '') {
    return { reply: { role: 'assistant', content: clarification.trim(), isClarification: true, at: now } }
  }

  const raw = Array.isArray(parsed['candidates'])
    ? parsed['candidates']
    : parsed['tool'] === undefined
      ? []
      : [parsed['tool']]

  const candidates = raw
    .filter((candidate): candidate is Record<string, unknown> => typeof candidate === 'object' && candidate !== null)
    .map((candidate) => completeDraft(candidate, now))
    .map((candidate) => candidate as unknown as ToolDefinition)

  if (candidates.length === 0) return { error: 'EMPTY_REPLY' }
  return { candidates }
}

/**
 * Fill in what only we know. A model that invents a timestamp produces a definition that
 * fails validation for a reason that has nothing to do with the user's request, and a
 * first tool is version 1 by definition (§8.1).
 */
function completeDraft(candidate: Record<string, unknown>, now: string): Record<string, unknown> {
  return {
    ...candidate,
    version: typeof candidate['version'] === 'number' ? candidate['version'] : 1,
    created_at: typeof candidate['created_at'] === 'string' ? candidate['created_at'] : now,
    updated_at: now,
  }
}

export interface InstructionInput {
  conversation: readonly ChatMessage[]
  pageAnalysis: PageAnalysis
  conservative: boolean
  noMoreQuestions: boolean
  /** Which representation the data section will use; the rules have to match it. */
  view?: PageView
  /** True on a closed-loop repair turn: the model has seen its own dry-run output. */
  repair?: boolean
}

/**
 * What the model is asked. Page content never appears here — it is the data section —
 * so this text is byte-identical whatever the page said.
 */
export function buildInstruction(input: InstructionInput): string {
  const lines: string[] = []

  lines.push(
    'You are building a Juxbly tool for the page described in the data section.',
    'Reply with JSON only, in exactly one of these shapes:',
    '  {"clarification": "<one short question>"}',
    '  {"candidates": [<ToolDefinition>, ...]}   // 1 to 3 candidates, most confident first',
    '',
    'A ToolDefinition is:',
    '  {"tool_id": "tool_8f3a2b", "name": "<short name>", "description": "<one sentence>",',
    '   "category": "data" | "enhance" | "analyze" | "export",',
    '   "url_pattern": "https://<exact host>/<path, trailing * allowed>", "version": 1,',
    '   "steps": [',
    '     {"type": "extract", "mode": "list" | "single", "selector": "<container css>",',
    '      "fields": {"<name>": "<css, relative to selector>"},',
    '      "field_types": {"<name>": "text" | "link" | "image" | "attr"},',
    '      "field_attrs": {"<name>": "<attribute name>"}, "output_to": "raw_items"},',
    '     {"type": "render", "view": "table" | "card" | "text", "input_from": "raw_items"}',
    '   ]}',
    '',
    'Rules:',
    '- category: exactly one of the four values in the schema above — "data", "enhance", "analyze" or "export". Never a synonym or a free-form label; anything else is rejected and the tool is not saved.',
    '- No control flow, no code, no scripts. Steps run in order, once.',
    '- Prefer the container and field selectors offered in the data section; they already exist on the page.',
    '- Build selectors from stable anchors only: semantic custom-element tags (e.g. shreddit-post), aria-* and data-* attributes, stable class names, or structural position (:nth-of-type).',
    "- Never use hashed or generated class names (like css-1x2y3z or jss1234): they change on the site's next deploy and the tool will break.",
    '- Field selectors are relative to the container selector.',
    `- To take the container element itself as a value, use the selector ":self". Never leave a field selector empty — there is no way to say "the whole thing" other than ":self".`,
    '- url_pattern: the host is written exactly as the page shows it — never `*.host` and never `*://`. A trailing `*` on the path is allowed; a wildcard host is not, because subdomains already match. The pattern must match the page URL in the data section, so the tool runs on the page it was built on.',
    '- "link" reads href, "image" reads src, "text" reads text.',
    '- "attr" reads a named attribute, and must always come with a "field_attrs" entry naming it.',
    '- Use "attr" when the value is not in the text node: a rating carried as a CSS class (class="star-rating Three"), or a full value kept in title= because the visible text is truncated. Reading such a field as "text" yields an empty or truncated column — do not settle for that.',
    '- When a read value still carries wrapper text around what the user asked for, add "field_transforms" for that field: an ordered list of ops applied to the value after it is read. V1 has one op, "capture": {"op": "capture", "pattern": "<regex>", "group": 0} keeps the regex match (or the numbered group) — class="star-rating Three" should end up as "Three" (pattern "\\\\w+$"), "In stock (19 available)" as "19".',
    '- Transform regexes follow the same safety rules as everywhere else (no nested quantifiers, 256 characters max) and are rejected otherwise. Never put a transform on an "image" field.',
    '- Never read an attribute whose name marks a credential slot (containing key, keys, token or secret); it is refused.',
  )

  if (input.view === 'flat') {
    lines.push(
      '- The data section numbers the containers it found. Write the container selector as `@N` — the index of the one you mean, and nothing else. `@3` is the container listed with `"index": 3`.',
      '- Field selectors are `@N` as well, indexing the `fields` list inside the container you chose.',
      '- Plain CSS is still allowed, but only when no listed container or field fits. Prefer the list: the selectors in it have already been checked against this page.',
    )
  }

  if (input.conservative) {
    lines.push(
      '- A previous attempt did not match this page. Choose the plainest, most literal container and fields; do not generalise.',
    )
  }

  if (input.repair === true) {
    lines.push(
      '- REPAIR TURN: a candidate was already built and executed against this page. The data section has a "dryRun" object: the extract step that ran, and sample_rows — what each field selector actually produced, first rows first.',
      '- Read sample_rows as evidence, not as suggestions: a field whose values look right is correct and must keep its selector; a field whose values are wrong, empty, or duplicated has a broken selector.',
      '- Fix the broken field selectors (and the container only if the rows themselves are wrong). Return the FULL corrected candidate(s) in the "candidates" shape — not a diff, not an explanation.',
    )
  }

  if (input.noMoreQuestions) {
    lines.push(
      '- Do not ask any further question. Return your best candidate even if you are unsure, or say what is blocking in a clarification only if there is truly nothing to try.',
    )
  }

  const transcript = input.conversation
    .map((message) => `${message.role === 'user' ? 'User' : 'Juxbly'}: ${message.content}`)
    .join('\n')

  if (transcript !== '') {
    lines.push('', 'Conversation so far:', transcript)
  }

  lines.push('', 'What the user wants, in their words, is the last user turn above.')

  return lines.join('\n')
}

/**
 * `@N` becomes the selector it points at.
 *
 * A reference is not a second language the model has to learn: it is the same shape as
 * a selector, in the same field, and it resolves to exactly the string the analyser
 * measured. It is also *measurable* — a run can be counted for how many candidates used
 * a reference and how many ignored the list and wrote CSS, which is the question the
 * `flat` view exists to answer.
 *
 * An index that does not exist is left alone rather than quietly repaired: a nonsense
 * reference should fail the same way a nonsense selector does, not silently become the
 * first container.
 */
function resolveRefs(
  candidates: readonly ToolDefinition[],
  analysis: PageAnalysis,
  view: PageView,
): ToolDefinition[] {
  if (view !== 'flat') return [...candidates]
  return candidates.map((candidate) => resolveOne(candidate, analysis))
}

function resolveOne(candidate: ToolDefinition, analysis: PageAnalysis): ToolDefinition {
  const steps = candidate.steps.map((step) => {
    if (step.type !== 'extract') return step

    const containerIndex = refIndex(typeof step.selector === 'string' ? step.selector : '')
    const container = containerIndex === null ? undefined : analysis.containers[containerIndex]
    const selector = container === undefined ? step.selector : container.tagPath

    const fields = Object.fromEntries(
      Object.entries(step.fields).map(([name, value]) => {
        const fieldIndex = refIndex(typeof value === 'string' ? value : '')
        const hint = fieldIndex === null || container === undefined ? undefined : container.fieldHints[fieldIndex]
        return [name, hint === undefined ? value : hint.selector]
      }),
    )

    // `selector` is optional in `single` mode, and `exactOptionalPropertyTypes` forbids
    // writing `undefined` back into it — so it is spread only when there is one.
    return { ...step, ...(selector === undefined ? {} : { selector }), fields }
  })

  return { ...candidate, steps }
}

/** `@3` → 3. Anything else is CSS and is left for the page to deal with. */
function refIndex(value: string): number | null {
  const match = /^@(\d+)$/.exec(value.trim())
  if (match === null) return null
  const index = Number(match[1])
  return Number.isInteger(index) ? index : null
}

/** How many dry-run rows the model sees, and how long one cell may be. */
const DRY_RUN_MAX_ROWS = 3
const DRY_RUN_MAX_CELL = 120

/**
 * What the model sees of its own candidate's execution.
 *
 * Bounded on purpose: three rows, each cell truncated. The point is observation —
 * "this selector pulled the promotion banner" is visible in one row — not a dump of
 * the extraction, which would double the prompt for no new information.
 */
export function describeDryRun(
  draft: ToolDefinition,
  sampleRows: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const step = draft.steps.find((entry): entry is ExtractStep => entry.type === 'extract')

  const rows = sampleRows.slice(0, DRY_RUN_MAX_ROWS).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([name, value]) => [
        name,
        typeof value === 'string' && value.length > DRY_RUN_MAX_CELL
          ? `${value.slice(0, DRY_RUN_MAX_CELL)}…`
          : value,
      ]),
    ),
  )

  return {
    ran_extract: step === undefined ? null : { selector: step.selector ?? null, fields: step.fields },
    sample_rows: rows,
    row_count_shown: rows.length,
  }
}

/**
 * What the model gets to see of the page.
 *
 * Counts, selectors and the truncated visible text — the same material the analyzer
 * produced, never more. The visible text is page content and is wrapped as data by
 * `buildPrompt`.
 *
 * The view decides the shape. `summarizeAnalysis` was the only one; it is kept as the
 * name the shipped view is known by, and `page-view.ts` is where both now live.
 */
export function summarizeAnalysis(analysis: PageAnalysis): Record<string, unknown> {
  return describePage(analysis, 'summary')
}
