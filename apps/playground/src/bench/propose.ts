/**
 * Generation and validation: page analysis → model → a DSL that passes §5.4.
 *
 * This is the product's own path, not a re-implementation of it: `handleBuildPropose`
 * is what the background runs (`docs/ARCHITECTURE.md` §9.1). The benchmark's only
 * additions are the two things a person would otherwise do by hand — answering "no,
 * just build it" when the model asks a clarifying question, and picking a candidate.
 */
import { createMockAdapter } from '@juxbly/browser'
import type { PageAnalysis, TokenUsage } from '@juxbly/core'
import { validateToolDefinition, type ToolDefinition } from '@juxbly/dsl'
import { handleBuildPropose } from '@juxbly/llm'

export interface Proposal {
  /** The first candidate that passes validation; `null` when nothing usable came back. */
  tool: ToolDefinition | null
  /**
   * Every candidate the model returned, in its own order.
   *
   * `tool` is what the runner would have executed under `first-valid`; the pool is kept
   * so a selection rule can be applied later — and re-applied on replay — without asking
   * the model again.
   */
  candidates: ToolDefinition[]
  usage?: TokenUsage
  error?: string
  /** True when the model asked a clarifying question instead of proposing a tool. */
  askedQuestion: boolean
}

export interface ProposeRequest {
  analysis: PageAnalysis
  task: string
  url: string
  noMoreQuestions: boolean
  /**
   * Round B: when present the model is shown what its own draft extracted and asked to
   * return corrected candidates. Passed through to the product's own
   * `handleBuildPropose` as a dep, exactly like `pageView`.
   */
  repair?: { draft: ToolDefinition; sampleRows: readonly Record<string, unknown>[] }
}

export type ProposeFn = (request: ProposeRequest) => Promise<Proposal>

export interface LlmSettings {
  apiKey: string
  baseUrl?: string
  model?: string
}

/**
 * Which page representation the model is shown.
 *
 * `summary` is the shipped one. `flat` is the Phase 2 experiment: the same page,
 * described as a numbered list the model has to choose from by index. Both are produced
 * by the product's own `handleBuildPropose` — the only difference is what it is handed
 * to describe, so a run is a measurement of the representation and not of a second
 * implementation of the prompt.
 */
export type PageView = 'summary' | 'flat'

export interface ProposerOptions {
  pageView?: PageView
}

/**
 * Wraps `handleBuildPropose` with the storage it reads the key from.
 *
 * The adapter is the mock on purpose: the benchmark has no extension runtime, and the
 * only thing the proposer needs from storage is the settings record. Everything that
 * decides the request — prompt, error codes, response parsing — stays production code.
 */
export function createLlmProposer(settings: LlmSettings, options: ProposerOptions = {}): ProposeFn {
  const adapter = createMockAdapter({
    storage: {
      'juxbly:settings': {
        api_key: settings.apiKey,
        ...(settings.baseUrl === undefined ? {} : { api_base_url: settings.baseUrl }),
        ...(settings.model === undefined ? {} : { model: settings.model }),
      },
    },
  })

  return async (request) => await proposeOnce(request, adapter, options)
}

async function proposeOnce(
  request: ProposeRequest,
  adapter: ReturnType<typeof createMockAdapter>,
  options: ProposerOptions,
): Promise<Proposal> {
  const result = await handleBuildPropose(
    {
      kind: 'build:propose',
      requestId: `bench:${request.url}`,
      conversation: [{ role: 'user' as const, content: request.task, at: new Date().toISOString() }],
      pageAnalysis: request.analysis,
      noMoreQuestions: request.noMoreQuestions,
    },
    adapter,
    {
      ...(options.pageView === undefined ? {} : { pageView: options.pageView }),
      ...(request.repair === undefined ? {} : { repair: request.repair }),
    },
  )

  if (!result.ok) return { tool: null, candidates: [], error: result.error ?? 'UNKNOWN', askedQuestion: false }

  const candidates = 'candidates' in result ? result.candidates : undefined
  if (candidates === undefined || candidates.length === 0) {
    // A clarification question is a legitimate answer in the product. Offline there is
    // nobody to reply, so it is recorded and the runner re-asks with `noMoreQuestions`.
    return { tool: null, candidates: [], askedQuestion: true }
  }

  const usage = result.usage === undefined ? {} : { usage: result.usage }
  const picked = pickValidCandidate(candidates, result.usage)
  return { ...picked, candidates, ...usage }
}

/**
 * Takes the first candidate the double gate accepts — the `first-valid` rule.
 *
 * A user would look at all of them; the benchmark cannot, and picking the last or the
 * "best looking" one would add a selection rule nobody reviewed. `best-scored` is that
 * reviewed rule, and it lives in `selection.ts` so the live run and the replay apply the
 * same one.
 */
function pickValidCandidate(
  candidates: ToolDefinition[],
  usage: TokenUsage | undefined,
): Omit<Proposal, 'candidates'> {
  const errors: string[] = []

  for (const candidate of candidates) {
    const validated = validateToolDefinition(candidate)
    if (validated.ok) return { tool: validated.value, askedQuestion: false, ...(usage === undefined ? {} : { usage }) }
    errors.push(validated.errors.map((error) => `${error.path}: ${error.message}`).join('; '))
  }

  return { tool: null, error: errors.join(' | ') || 'NO_CANDIDATE', askedQuestion: false, ...(usage === undefined ? {} : { usage }) }
}
