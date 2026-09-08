/**
 * The build session — `docs/ARCHITECTURE.md` §9.1 (build flow) and the A4 escalation
 * chain. This is the brain of the build panel; `BuildPanel.tsx` only renders what this
 * module decides.
 *
 * Two product rules live here and nowhere else:
 *
 * 1. **The clarification cap is a hard stop.** Two questions, then the model must produce
 *    a draft or a suggestion. If a third question arrives anyway it is dropped, not shown
 *    (`conversation.ts`).
 * 2. **Failure escalates in a fixed order, and the user sees every step.** Retry once with
 *    a conservative prompt → attach a screenshot and go visual, but only when the page is
 *    genuinely hostile to the DOM route → suggest a stronger model → stop and give advice.
 *    No level is skipped, none is unbounded, and each one is visible in the panel as it
 *    happens.
 *
 * Everything that reaches out is injected, so the whole chain is exercised in a node test
 * with a scripted model and no browser.
 */
import type {
  CandidateEvaluation,
  ChatMessage,
  PageAnalysis,
  TokenUsage,
  ValidationError,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { validateToolDefinition } from '@juxbly/dsl'
import { appendAssistant, appendUser, canAskMore } from './conversation'
import { applyFieldSelector, isDomHostile, toProposal } from './proposal'
import type { BuildProposal } from './proposal'

export type BuildPhase =
  | 'idle'
  | 'analyzing'
  | 'proposing'
  | 'clarifying'
  | 'awaiting-confirm'
  | 'picking'
  | 'saving'
  | 'saved'
  | 'failed'

/** §9.1 A4: the four levels, in order. `stopped` is the fourth one firing, not a fifth. */
export type EscalationLevel = 'none' | 'retry' | 'vision' | 'stronger-model' | 'stopped'

/** What the panel suggests once the chain stops. Each one is a concrete next step, not a status. */
export type BuildAdvice = 'narrow-scope' | 'rephrase' | 'page-complex'

/**
 * A hard bound on one user turn. The levels already bound themselves; this exists so a
 * scripted model that returns the same failing candidate forever cannot turn "stop-loss"
 * into a loop.
 */
export const MAX_PROPOSE_CALLS = 4

/**
 * Failure codes the panel can name. They are the codes the background already speaks
 * (`VALIDATION_FAILED` from §5.4, `SAVE_FAILED` from the storage gateway), so a panel and
 * a log line agree on what went wrong without either inventing prose.
 */
export const VALIDATION_FAILED = 'VALIDATION_FAILED'
export const SAVE_FAILED = 'SAVE_FAILED'

export interface ProposeRequest {
  conversation: readonly ChatMessage[]
  pageAnalysis: PageAnalysis
  /** Level ①: ask the model for the plainest, most literal reading of the page. */
  conservative: boolean
  /**
   * The cap talking to the model: when true the model must produce a draft instead of
   * another question. Enforced here as well, because a prompt is a request and this is a
   * rule.
   */
  noMoreQuestions: boolean
  /** A3: present only after the DOM route has already failed (§7.2). */
  screenshot?: string
}

export type ProposeReply =
  | { kind: 'clarify'; content: string; usage?: TokenUsage }
  | { kind: 'candidates'; candidates: readonly ToolDefinition[]; usage?: TokenUsage }
  | { kind: 'failed'; error: string }

export interface SaveResult {
  ok: boolean
  error?: string
}

/**
 * Candidate scoring, injected rather than imported.
 *
 * `packages/ui` must not depend on `packages/capabilities` — capabilities already depends
 * on ui for the render views, so importing it back would close a cycle. The scorer is a
 * two-method port instead: the content script builds it from `evaluateCandidates()`, and a
 * test builds it from a scripted one.
 */
export interface CandidateScorer {
  score(candidates: readonly ToolDefinition[]): CandidateEvaluation[]
  /** Identity of a plan: same container and same field selectors means "not a new idea". */
  fingerprint(candidate: ToolDefinition): string
}

export interface BuildSessionPorts {
  /** Re-read on every turn: the page may have changed while the user was typing. */
  analyze(): PageAnalysis
  propose(request: ProposeRequest): Promise<ProposeReply>
  scorer: CandidateScorer
  captureScreenshot(): Promise<string>
  save(tool: ToolDefinition): Promise<SaveResult>
  now(): string
  log?(message: string, details?: readonly unknown[]): void
}

export interface BuildSessionState {
  phase: BuildPhase
  conversation: ChatMessage[]
  proposal: BuildProposal | null
  escalation: EscalationLevel
  /**
   * Every level the chain has fired this turn, in order. A level the chain moved past in
   * the same async turn would otherwise never be on screen — and §9.1 forbids silent
   * retries. Reset per turn.
   */
  escalationTrail: EscalationLevel[]
  advice: BuildAdvice[]
  /** Level ① allowance, per user turn: a void retry does not consume it. */
  retryUsed: boolean
  /** Session-level: a screenshot leaves the machine, so it happens at most once. */
  visionUsed: boolean
  strongerModelUsed: boolean
  error: string | null
  /**
   * Field-level reasons from the last `validateToolDefinition` that rejected the proposal.
   * Empty until one does. Shown verbatim: they are the validator's own English wording
   * (§5.5), not page content, and "which field is wrong" is the only useful thing to say
   * when a draft cannot be saved.
   */
  validation: ValidationError[]
  /** Bumped whenever the boxes must be redrawn and the glow replayed. */
  highlightToken: number
  pickingField: string | null
  /**
   * What the last model call cost (BYOK transparency, UI_SPEC §9 rule 4). `null` before
   * the first call and after a failure — a failed call spends nothing reportable.
   */
  usage: TokenUsage | null
}

export interface BuildSession {
  state(): BuildSessionState
  subscribe(listener: (state: BuildSessionState) => void): () => void
  /** Send a request (first message or a re-description). */
  describe(text: string): Promise<void>
  /** "None of these" — a turn in the same conversation, never a reset. */
  rejectProposal(rejectionText: string): Promise<void>
  confirm(): Promise<void>
  startPick(field: string): void
  cancelPick(): void
  commitPick(field: string, selector: string): void
  /** Level ③, taken by the user: one more attempt after the suggestion was shown. */
  retryWithStrongerModel(): Promise<void>
}

interface Best {
  tool: ToolDefinition
  evaluation: CandidateEvaluation
}

export function createBuildSession(ports: BuildSessionPorts): BuildSession {
  let state: BuildSessionState = initialState()
  const listeners = new Set<(state: BuildSessionState) => void>()

  function patch(next: Partial<BuildSessionState>): void {
    state = { ...state, ...next }
    for (const listener of [...listeners]) listener(state)
  }

  function log(message: string, details?: readonly unknown[]): void {
    ports.log?.(message, details)
  }

  /**
   * One full attempt at a proposal: the level chain (§9.1 A4).
   *
   * Three properties decide the shape of this loop:
   *
   * - **The best candidate anywhere in the chain wins**, not the one from the last level.
   *   `best` is a running maximum, and the chain stops at the first level that produced a
   *   match — so a later, worse level can never overwrite a verified proposal. That is
   *   "carry the best across levels" (the mdn net-loss case in the A4 spike): the cheap
   *   way to satisfy it is to stop escalating once something actually matched.
   * - **A retry that changes nothing is not a retry.** The allowance is spent when the
   *   retry is made and refunded when it comes back with a plan already on the table
   *   (§9.1 level ①).
   * - **A model that never answered is not the same failure as a model whose answer did
   *   not match.** The first retries once and then stops; the second has earned the rest
   *   of the chain, because the page was read and there is something to escalate about.
   */
  async function runProposal(): Promise<void> {
    patch({ phase: 'analyzing' })
    const analysis = ports.analyze()

    let conservative = false
    let screenshot: string | undefined
    let calls = 0
    let best: Best | null = null
    let retried = false
    let evaluated = false
    const seen = new Set<string>()

    while (calls < MAX_PROPOSE_CALLS) {
      calls += 1
      patch({ phase: 'proposing' })

      const reply = await ports.propose({
        conversation: state.conversation,
        pageAnalysis: analysis,
        conservative,
        noMoreQuestions: !canAskMore(state.conversation),
        ...(screenshot === undefined ? {} : { screenshot }),
      })

      if (reply.kind === 'clarify') {
        // The cap is enforced twice: the prompt was told to stop asking, and a third
        // question is dropped here rather than shown.
        if (!canAskMore(state.conversation)) {
          log('clarification cap reached, model asked anyway')
          stop(['narrow-scope', 'rephrase'])
          return
        }

        patch({
          conversation: appendAssistant(state.conversation, reply.content, ports.now(), {
            isClarification: true,
          }),
          phase: 'clarifying',
          usage: reply.usage ?? state.usage,
        })
        return
      }

      if (reply.kind === 'failed') {
        log('propose failed', [reply.error])
        patch({ error: reply.error })

        if (!retried) {
          retried = true
          patch({ retryUsed: true, escalation: 'retry' })
          conservative = true
          continue
        }
        if (!evaluated) {
          stop(['narrow-scope', 'rephrase', 'page-complex'])
          return
        }
        // Otherwise fall through: the model answered once and the page said no, so the
        // remaining levels still owe the user an answer.
      } else {
        const valid = reply.candidates.filter((candidate) => validateToolDefinition(candidate).ok)
        const rejected = reply.candidates.length - valid.length
        if (rejected > 0) log('candidates rejected by validation', [rejected])

        const fingerprints = valid.map((candidate) => ports.scorer.fingerprint(candidate))
        const distinct = fingerprints.some((fingerprint) => !seen.has(fingerprint))
        for (const fingerprint of fingerprints) seen.add(fingerprint)

        evaluated = true
        const evaluations = ports.scorer.score(valid)
        for (const evaluation of evaluations) {
          const tool = valid[evaluation.candidateIndex]
          if (tool === undefined) continue
          if (best === null || evaluation.score > best.evaluation.score) {
            best = { tool, evaluation }
          }
        }

        if (best !== null && best.evaluation.hitCount > 0) {
          // There is no confidence exception here, and there must never be one: M0
          // falsified confidence tiering (`docs/PRODUCT.md` §4.2), so *every* create and
          // every edit stops at the highlight. A code path that skips the confirmation
          // gate because a candidate scored well is a bug, not an optimisation.
          patch({
            proposal: toProposal(best.tool, best.evaluation),
            phase: 'awaiting-confirm',
            escalation: 'none',
            advice: [],
            error: null,
            highlightToken: state.highlightToken + 1,
            usage: reply.usage ?? state.usage,
          })
          return
        }

        // ── Level ①: one conservative retry, and only if it is actually a new plan ────
        if (!retried) {
          retried = true
          fire('retry', { retryUsed: true, escalation: 'retry' })
          conservative = true
          continue
        }

        if (!distinct) {
          // A retry that reproduces a plan already on the table has not tried anything:
          // the allowance is refunded rather than spent (§9.1 level ①).
          log('retry produced no new plan, allowance refunded')
          fire('retry', { retryUsed: false, escalation: 'retry' })
        }
      }

      // ── Level ②: visual fallback, only for a page the DOM route cannot read ─────────
      if (!state.visionUsed && isDomHostile(analysis)) {
        fire('vision', { visionUsed: true, escalation: 'vision' })
        const captured = await ports.captureScreenshot()
        if (captured !== '') {
          screenshot = captured
          continue
        }
        log('screenshot unavailable, skipping the visual fallback')
      }

      // ── Level ③: suggest a stronger model, and wait for the user ───────────────────
      if (!state.strongerModelUsed) {
        fire('stronger-model', {
          phase: 'failed',
          escalation: 'stronger-model',
          advice: ['narrow-scope', 'rephrase'],
        })
        return
      }

      // ── Level ④: stop with something the user can actually do ─────────────────────
      stop(['narrow-scope', 'rephrase', 'page-complex'])
      return
    }

    // Reached only if the bound was hit with every level still standing: stop, never loop.
    stop(['narrow-scope', 'rephrase', 'page-complex'])
  }

  /** Record a fired level on the trail, then apply the rest of the patch. */
  function fire(level: EscalationLevel, rest: Partial<BuildSessionState>): void {
    patch({
      ...(state.escalationTrail.includes(level)
        ? {}
        : { escalationTrail: [...state.escalationTrail, level] }),
      ...rest,
    })
  }

  function stop(advice: BuildAdvice[]): void {
    patch({ phase: 'failed', escalation: 'stopped', advice })
  }

  function startTurn(text: string): void {
    if (text.trim() === '') return
    patch({
      conversation: appendUser(state.conversation, text, ports.now()),
      phase: 'analyzing',
      proposal: null,
      escalation: 'none',
      escalationTrail: [],
      advice: [],
      error: null,
      validation: [],
      retryUsed: false,
    })
  }

  return {
    state: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async describe(text: string): Promise<void> {
      startTurn(text)
      if (text.trim() === '') return
      await runProposal()
    },

    async rejectProposal(rejectionText: string): Promise<void> {
      // Same conversation, same cap: the model sees the rejection and must produce
      // something different rather than asking the same two questions again.
      await this.describe(rejectionText)
    },

    async confirm(): Promise<void> {
      const proposal = state.proposal
      if (proposal === null) return

      // Validated again here, after any point-select correction and before the write.
      // The background validates once more (§5.4 double gate); this one is the one that
      // can name the field, because it is the one holding the errors.
      const validation = validateToolDefinition(proposal.tool)
      if (!validation.ok) {
        log('proposal rejected before saving', validation.errors.map((error) => error.path))
        patch({ phase: 'failed', error: VALIDATION_FAILED, validation: validation.errors, advice: [] })
        return
      }

      patch({ phase: 'saving', validation: [] })
      const result = await ports.save(validation.value)

      if (result.ok) {
        patch({ phase: 'saved' })
        return
      }

      patch({ phase: 'failed', error: result.error ?? SAVE_FAILED, validation: [], advice: [] })
    },

    startPick(field: string): void {
      if (state.proposal === null) return
      patch({ phase: 'picking', pickingField: field })
    },

    cancelPick(): void {
      patch({ phase: 'awaiting-confirm', pickingField: null })
    },

    commitPick(field: string, selector: string): void {
      const proposal = state.proposal
      if (proposal === null) return

      const tool = applyFieldSelector(proposal.tool, field, selector, ports.now())
      patch({
        proposal: toProposal(tool, proposal.evaluation),
        phase: 'awaiting-confirm',
        pickingField: null,
        // Replay the glow: the boxes moved, and the signature moment is the confirmation.
        highlightToken: state.highlightToken + 1,
      })
    },

    async retryWithStrongerModel(): Promise<void> {
      if (state.strongerModelUsed) return
      patch({ strongerModelUsed: true, escalation: 'none', advice: [], error: null })
      await runProposal()
    },
  }
}

function initialState(): BuildSessionState {
  return {
    phase: 'idle',
    conversation: [],
    proposal: null,
    escalation: 'none',
    escalationTrail: [],
    advice: [],
    retryUsed: false,
    visionUsed: false,
    strongerModelUsed: false,
    error: null,
    validation: [],
    highlightToken: 0,
    pickingField: null,
    usage: null,
  }
}
