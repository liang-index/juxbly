/**
 * The recorded model: an OpenAI-compatible endpoint that replays fixed answers.
 *
 * Why it exists (`task/stage-1-14.md` Scope 1): the lifecycle script has to be repeatable
 * and has to cost nothing. A real endpoint drifts — the same prompt returns different
 * selectors next week — and every red run would be unreadable: failure or model mood?
 * Replaying takes both out of the picture, so a red run means the product changed.
 *
 * Three juxbly call sites reach it, and it tells them apart by the shape of the prompt
 * each one builds (`packages/llm/src/build-prompt.ts`, `semantic-prompt.ts`):
 *
 * - `build:propose`      → a clarification question or candidate tool definitions
 * - health semantic check → `{"verdict": "ok" | "suspicious", "reason": "..."}`
 * - an `llm` run step    → plain text (never JSON), like a real completion does
 *
 * The replies are deliberately *shaped by the page variant the server is serving*: that is
 * what lets one script walk a tool from build → break → repair without any step being
 * faked from the test side. Nothing here is injected into the extension — the extension
 * only ever sees a normal OpenAI-compatible HTTP response.
 *
 * Every request is counted **here**, server side. Counting calls from the panel's own
 * token line would make the assertion trust the thing it is measuring.
 */
const HEALTH_MARK = 'You are a health checker inside a browser tool called Juxbly'
const PROPOSE_MARK = 'You are building a Juxbly tool for the page described'

/** Mirrors of the data-section tags (`packages/llm/src/build-prompt.ts`), used for counting. */
const DATA_OPEN_TAG = '<page_data>'
const DATA_CLOSE_TAG = '</page_data>'

/** The tool every scenario builds and repairs: one identity for one lifecycle. */
export const LIFECYCLE_TOOL_ID = 'tool_lifecycle'

/**
 * The usages recorded responses report. Tokens are BYOK-visible, so a reply that cost
 * nothing must be able to say so — these are real-shaped numbers, not zeros.
 */
const USAGE = {
  propose: { prompt_tokens: 968, completion_tokens: 212 },
  health: { prompt_tokens: 150, completion_tokens: 12 },
  step: { prompt_tokens: 320, completion_tokens: 64 },
}

/**
 * One candidate per page variant — the whole point of the break/repair pair.
 *
 * The "changed" selectors describe the redesigned page, so the repair proposal has
 * something true to propose: this is a recorded answer to "the container disappeared",
 * not a hand-written definition pasted into storage by the test.
 */
function candidateFor(variant, pattern, now) {
  const rows =
    variant === 'changed'
      ? {
          selector: 'li.item',
          fields: { name: '.name', cost: '.cost' },
          label: 'Renamed product rows',
        }
      : {
          selector: 'li.product',
          fields: { title: '.title', price: '.price' },
          label: 'Product rows',
        }

  return {
    tool_id: LIFECYCLE_TOOL_ID,
    name: rows.label,
    description: 'Reads each row of the product list into a table.',
    category: 'data',
    url_pattern: pattern,
    version: 1,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: rows.selector,
        fields: rows.fields,
        field_types: Object.fromEntries(Object.keys(rows.fields).map((field) => [field, 'text'])),
        output_to: 'raw_items',
      },
      { type: 'render', view: 'table', input_from: 'raw_items' },
    ],
    created_at: now,
    updated_at: now,
  }
}

export function createModelMock(options = {}) {
  const pattern = options.pattern ?? '127.0.0.1/*'
  const clock = options.clock ?? (() => new Date().toISOString())

  let variant = 'shop'
  let scenario = { proposeMode: 'direct', semanticVerdict: 'ok' }
  const calls = { propose: 0, health: 0, step: 0 }
  const seen = []

  const state = () => ({
    variant,
    scenario: { ...scenario },
    calls: { ...calls },
    recent: seen.slice(-6),
  })

  const setVariant = (next) => {
    variant = next
    return state()
  }

  const setScenario = (patch) => {
    scenario = { ...scenario, ...patch }
    return state()
  }

  const reset = () => {
    variant = 'shop'
    scenario = { proposeMode: 'direct', semanticVerdict: 'ok' }
    calls.propose = 0
    calls.health = 0
    calls.step = 0
    seen.length = 0
    return state()
  }

  /**
   * The build flow's two legal answers (§5.4: a reply we cannot read is a failure, not an
   * empty success — so the shapes here are the product's, not approximations of them).
   */
  const proposeReply = () => {
    if (scenario.proposeMode === 'clarify-first' && calls.propose === 0) {
      return { json: { clarification: 'Do you want every column, or just the name and price?' } }
    }
    return { json: { candidates: [candidateFor(variant, pattern, clock())] } }
  }

  const healthReply = () => ({
    json: {
      verdict: scenario.semanticVerdict,
      reason:
        scenario.semanticVerdict === 'suspicious'
          ? 'the sampled values do not look like what the field names promise'
          : 'the sampled values still match the field names',
    },
  })

  /** A run-time step is a plain completion: text in, text out, no JSON envelope. */
  const stepReply = (body) => ({ text: labelsFor(countRecords(body)) })

  const route = (kind, body) =>
    kind === 'health' ? healthReply() : kind === 'propose' ? proposeReply(body) : stepReply(body)

  /**
   * One completion. Returns the OpenAI envelope the client already expects
   * (`packages/llm/src/client.ts`): `choices[0].message.content` plus `usage`.
   *
   * A structured reply is JSON-encoded exactly because the caller asked for a JSON object
   * (`response_format`), which is what a real endpoint does; a text reply goes through
   * untouched, which is what an `llm` step gets.
   */
  const completion = (body) => {
    const kind = classify(body)
    const reply = route(kind, body)
    calls[kind] += 1
    seen.push(kind)

    const content = reply.text === undefined ? JSON.stringify(reply.json) : reply.text

    return {
      id: `chatcmock-${String(calls[kind])}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: body?.model ?? 'mock-model',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: USAGE[kind],
    }
  }

  return { completion, state, setVariant, setScenario, reset }
}

/** Which of the three callers this request came from, read off its own prompt. */
function classify(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  if (text(messages[0]).includes(HEALTH_MARK)) return 'health'
  if (text(messages[messages.length - 1]).includes(PROPOSE_MARK)) return 'propose'
  return 'step'
}

/** `messages[].content` is a string or the content-part array (`LlmContentPart[]`, §5.5). */
function text(message) {
  if (message === undefined || message === null) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join(' ')
}

/** One label per record, in order — what the `classify` task asks for. */
function labelsFor(count) {
  return Array.from({ length: count }, (_, index) => `label-${String(index + 1)}`).join('\n')
}

/**
 * How many records this step was handed. Read out of the data section, because that is
 * where page content travels (§12.3): counting rows is the only thing the reply needs to
 * know about them, and nothing below ever sends them anywhere.
 */
function countRecords(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const data = messages.map(text).find((value) => value.includes(DATA_OPEN_TAG)) ?? ''
  const inner = data.slice(data.indexOf(DATA_OPEN_TAG), data.indexOf(DATA_CLOSE_TAG))

  try {
    const parsed = JSON.parse(inner.slice(DATA_OPEN_TAG.length).trim())
    return Array.isArray(parsed) ? parsed.length : 4
  } catch {
    return 4
  }
}
