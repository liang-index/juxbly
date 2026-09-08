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
import type { ToolDefinition } from '@juxbly/dsl'
import { loadSettings } from '@juxbly/storage'
import { buildPrompt, buildVisionMessages, DEFAULT_SYSTEM_PROMPT, stringifyData } from './build-prompt'
import { callLlm, DEFAULT_API_BASE_URL } from './client'
import type { LlmFetch } from './client'
import { isLlmError } from './errors'

const log: Logger = createLogger('BUILD')

export interface BuildProposeDeps {
  fetchImpl?: LlmFetch
  logger?: Logger
  timeoutMs?: number
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
    const model = settings?.model ?? ''

    if (apiKey.trim() === '' || model.trim() === '') return fail('NOT_CONFIGURED')

    const instruction = buildInstruction({
      conversation,
      pageAnalysis,
      conservative: conservative === true,
      noMoreQuestions: noMoreQuestions === true,
    })

    const messages =
      typeof screenshot === 'string' && screenshot !== ''
        ? buildVisionMessages(screenshot, instruction)
        : buildPrompt({
            system: DEFAULT_SYSTEM_PROMPT,
            instruction,
            data: stringifyData(summarizeAnalysis(pageAnalysis)),
          })

    const response = await callLlm(
      {
        endpoint: { baseUrl: settings?.api_base_url ?? DEFAULT_API_BASE_URL, apiKey, model },
        messages,
        responseFormat: 'json',
        ...(deps.timeoutMs === undefined ? {} : { timeoutMs: deps.timeoutMs }),
      },
      { ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }), logger },
    )

    const reply = readReply(response.output, new Date().toISOString())
    // A reply we could not read is a failure, not an empty success: `ok` is what the panel
    // branches on, and "the model came back but said nothing usable" has to take the same
    // path as a request that never went out.
    if ('error' in reply) return fail(reply.error)

    return {
      kind: 'build:propose_result',
      requestId,
      ok: true,
      ...reply,
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
    '   "url_pattern": "<glob matching this page>", "version": 1,',
    '   "steps": [',
    '     {"type": "extract", "mode": "list" | "single", "selector": "<container css>",',
    '      "fields": {"<name>": "<css, relative to selector>"},',
    '      "field_types": {"<name>": "text" | "link" | "image"}, "output_to": "raw_items"},',
    '     {"type": "render", "view": "table" | "card" | "text", "input_from": "raw_items"}',
    '   ]}',
    '',
    'Rules:',
    '- No control flow, no code, no scripts. Steps run in order, once.',
    '- Prefer the container and field selectors offered in the data section; they already exist on the page.',
    '- Field selectors are relative to the container selector.',
    '- "link" reads href, "image" reads src, "text" reads text.',
  )

  if (input.conservative) {
    lines.push(
      '- A previous attempt did not match this page. Choose the plainest, most literal container and fields; do not generalise.',
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
 * What the model gets to see of the page.
 *
 * Counts, selectors and the truncated visible text — the same material the analyzer
 * produced, never more. The visible text is page content and is wrapped as data by
 * `buildPrompt`.
 */
export function summarizeAnalysis(analysis: PageAnalysis): Record<string, unknown> {
  return {
    url: analysis.url,
    title: analysis.title,
    visibleText: analysis.visibleText,
    truncated: analysis.truncated,
    scrollHint: analysis.scrollHint,
    customElements: analysis.customElements,
    shadowHosts: analysis.shadowHosts,
    containers: analysis.containers.map((container) => ({
      tagPath: container.tagPath,
      hitCount: container.hitCount,
      sampleFields: container.sampleFields,
      fieldHints: container.fieldHints.map((hint) => ({
        selector: hint.selector,
        sampleText: hint.sampleText,
      })),
    })),
  }
}
