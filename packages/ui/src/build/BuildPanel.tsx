import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BrowserAdapter } from '@juxbly/browser'
import type { PageAnalysis, RepairSaveRequest, RepairSession } from '@juxbly/core'
import { getPrefilledMessage, recordFailure, shouldStop } from '@juxbly/repair'
import type { BallEvent } from '../floating-ball/ball-state'
import { HighlightLayer } from '../highlight/HighlightLayer'
import type { HighlightQuery } from '../highlight/highlight-layer'
import { containerFor, relativeSelector } from '../highlight/pick'
import { t, type CopyKey } from '../copy'
import { KeyRequest } from '../onboarding/KeyRequest'
import type { KeyRequestPorts } from '../onboarding/KeyRequest'
import { estimateBuildCost } from '../onboarding/key-request'
import { ChatStream } from './chat'
import { InspectTab } from './inspect-tab'
import { createMessagingPorts } from './ports'
import { createBuildSession } from './build-session'
import type { BuildSessionState, CandidateScorer } from './build-session'

/**
 * The build panel — `docs/ARCHITECTURE.md` §9.1, `docs/UI_SPEC.md` §5 / §7 / §8.
 *
 * The panel owns no decisions: the conversation, the clarification cap and the escalation
 * chain all live in `build-session.ts`, and this component is the wiring between that
 * machine, the page (highlight + point-select) and the background (model + storage).
 *
 * Two behaviours are worth naming because they are easy to get wrong:
 *
 * - **Esc collapses, it does not clear** (UI_SPEC §8). The session, the draft and the
 *   conversation all survive; only the DOM node is hidden by the caller.
 * - **Point-select is one click**, and it is consumed in the capture phase with
 *   `preventDefault`, so pointing at a link does not also navigate to it.
 */

/**
 * A repair — `docs/ARCHITECTURE.md` §9.3, `task/stage-1-12.md`.
 *
 * Same flow, one difference that matters: the first turn is already written. The user has
 * just been told the tool is broken; making them restate that is the opposite of helpful.
 * For a user-initiated rework the preset is empty — no breakage was detected, so none is
 * claimed.
 *
 * Both halves are handed in separately on purpose: `request` is what crosses to the
 * background, `session` is the attempt counter that stays in this panel. Keeping them
 * apart is what stops a re-render from smuggling a different tool id into a save.
 */
export interface BuildRepair {
  /** What `build:save_tool` carries: it turns the write into a new version (§9.3). */
  request: RepairSaveRequest
  /** The preset message and the attempt count — the stop-loss has exactly one home. */
  session: RepairSession
}

export interface BuildPanelProps {
  adapter: BrowserAdapter
  /** Re-read on demand: the page can change between two messages. */
  analyze: () => PageAnalysis
  /** The content script's shadow-piercing query. */
  query: HighlightQuery
  /** Where point-select clicks are captured (the content script passes `document`). */
  root: EventTarget
  scorer: CandidateScorer
  /**
   * Stage 1-13 node ②: the opening line, resolved by the content script from the flags
   * before the panel mounted. Absent → the recurring greeting stands alone.
   */
  introLine?: CopyKey | undefined
  /**
   * Stage 1-13 node ③: the late key ask. Present → a proposal that fails with
   * `NOT_CONFIGURED` is answered with the ask instead of a dead end, because that code
   * means "no endpoint configured", decided before any traffic left.
   */
  keyRequest?: { ports: KeyRequestPorts } | undefined
  /** Optional: the mounted ball, so the flow is visible when the panel is not. */
  ball?: { send(event: BallEvent): void }
  /** Present when this panel was opened to repair an existing tool (stage 1-12). */
  repair?: BuildRepair
  onClose?: () => void
  onSaved?: () => void
}

const SUGGESTIONS = [
  { id: 'list', label: t('build.suggestions.list') },
  { id: 'prices', label: t('build.suggestions.prices') },
  { id: 'links', label: t('build.suggestions.links') },
] as const

export function BuildPanel({
  adapter,
  analyze,
  query,
  root,
  scorer,
  introLine,
  keyRequest,
  ball,
  repair,
  onClose,
  onSaved,
}: BuildPanelProps) {
  // The save port is bound to `request` alone: this panel either saves a new tool or writes
  // the next version of one, and it must not change its mind mid-session.
  const request = repair?.request
  const session = useMemo(
    () =>
      createBuildSession({
        analyze,
        scorer,
        now: () => new Date().toISOString(),
        ...createMessagingPorts(adapter, request),
      }),
    [adapter, analyze, scorer, request],
  )

  const [state, setState] = useState(() => session.state())
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<'chat' | 'inspect'>('chat')
  const [analysis, setAnalysis] = useState<PageAnalysis>(() => analyze())
  const [progress, setProgress] = useState<RepairSession | null>(() => repair?.session ?? null)
  const [keyStep, setKeyStep] = useState(false)
  const savedNotified = useRef(false)
  const started = useRef(false)
  const countedFailure = useRef<BuildSessionState | null>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => session.subscribe(setState), [session])

  // Node ③: the ask replaces the composer the moment the panel learns there is no
  // endpoint. `NOT_CONFIGURED` is decided in the background before any request is built,
  // so reaching this step has cost the user nothing — which is the whole point of asking
  // here rather than at install.
  useEffect(() => {
    if (keyRequest === undefined) return
    if (state.phase === 'failed' && state.error === 'NOT_CONFIGURED') setKeyStep(true)
  }, [keyRequest, state.phase, state.error])

  // Node ③: continuing means the key is saved and the milestone is written, so the turn
  // that failed is replayed from the conversation rather than re-typed by the user.
  const retryAfterKey = (): void => {
    setKeyStep(false)
    const lastUser = [...state.conversation].reverse().find((message) => message.role === 'user')
    if (lastUser === undefined) return
    void session.describe(lastUser.content)
  }

  /**
   * A repair opens mid-conversation: the first turn is the context message, sent at once
   * so the user lands on a flow that is already working rather than on an empty box.
   * Clicking the repair CTA *is* the confirmation that spending the call is wanted.
   */
  useEffect(() => {
    if (progress === null || started.current) return
    const preset = getPrefilledMessage(progress)
    if (preset === '') return
    started.current = true
    void session.describe(preset)
  }, [progress, session])

  /**
   * The stop-loss (§9.3). A repair gets `REPAIR_MAX_ATTEMPTS` turns and then says what the
   * user can do instead of asking the model again.
   *
   * `countedFailure` holds the *exact* state object that was already counted: `failed` is a
   * phase the session sits in, not an event, so without it every unrelated re-render would
   * add another attempt and the second failure would arrive before it happened.
   *
   * A cancellation never reaches here — closing the panel leaves the phase alone — which is
   * the whole of the "a cancellation is not a failure" rule.
   */
  useEffect(() => {
    if (progress === null || state.phase !== 'failed' || countedFailure.current === state) return
    countedFailure.current = state
    setProgress((current) => (current === null ? null : recordFailure(current)))
  }, [progress, state])

  const stopped = progress !== null && shouldStop(progress)

  /**
   * The highlight boxes are `position: fixed`, so their containing block must be the
   * viewport. Any `transform` on the panel — and the panel carries one for dragging —
   * would silently claim that role and shift every box by the panel's own offset
   * (found on chromestatus: correct `style.left/top`, boxes rendered over the panel
   * instead of the page). The layer therefore lives directly in the shadow root, one
   * sibling over, never inside the panel (UI_SPEC §7.5).
   */
  const [overlay, setOverlay] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const root = panelRef.current?.getRootNode()
    if (!(root instanceof ShadowRoot)) return
    const layer = document.createElement('div')
    layer.className = 'jx-highlight-overlay'
    root.append(layer)
    setOverlay(layer)
    return () => layer.remove()
  }, [])

  // The ball is the only always-visible surface, so the flow has to show up on it. Illegal
  // transitions are ignored by the machine, which is what makes this mapping safe to fire
  // on every phase change.
  useEffect(() => {
    if (ball === undefined) return
    if (state.phase === 'analyzing' || state.phase === 'proposing') ball.send({ kind: 'analyze-start' })
    if (state.phase === 'awaiting-confirm') ball.send({ kind: 'proposal-ready' })
    if (state.phase === 'saving') ball.send({ kind: 'build-start' })
    if (state.phase === 'saved') ball.send({ kind: 'build-done' })
    if (state.phase === 'failed') ball.send({ kind: 'build-failed' })
  }, [ball, state.phase])

  useEffect(() => {
    if (state.phase === 'saved' && !savedNotified.current) {
      savedNotified.current = true
      onSaved?.()
    }
  }, [state.phase, onSaved])

  // Esc: cancel a pick first, collapse the panel second. State is never cleared (§8).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (state.phase === 'picking') {
        session.cancelPick()
        return
      }
      onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [state.phase, session, onClose])

  // Point-select: one click on the page, in the capture phase, so a link is picked rather
  // than followed. The listener is removed the moment it fires or the mode is left.
  useEffect(() => {
    if (state.phase !== 'picking' || state.pickingField === null || state.proposal === null) return

    const field = state.pickingField
    const containerSelector = state.proposal.containerSelector

    const onPick = (event: Event): void => {
      event.preventDefault()
      event.stopPropagation()

      const target = event.target
      if (!(target instanceof Element)) return

      const container = containerFor(target, containerSelector, query)
      session.commitPick(field, relativeSelector(target, container))
    }

    root.addEventListener('click', onPick, { capture: true, once: true } as AddEventListenerOptions)
    return () => root.removeEventListener('click', onPick, { capture: true })
  }, [state.phase, state.pickingField, state.proposal, query, root, session])

  const send = (text: string): void => {
    if (text.trim() === '') return
    setDraft('')
    setAnalysis(analyze())
    void session.describe(text)
  }

  const confirm = (): void => {
    void session.confirm()
  }

  return (
    <>
      <section className="jx-panel" ref={panelRef} data-phase={state.phase} aria-label={t('build.title')}>
      <header className="jx-panel-head">
        <span className="jx-panel-title">{t('build.title')}</span>
        <div className="jx-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'chat'}
            className={tab === 'chat' ? 'jx-tab is-active' : 'jx-tab'}
            onClick={() => setTab('chat')}
          >
            {t('build.tab.chat')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'inspect'}
            className={tab === 'inspect' ? 'jx-tab is-active' : 'jx-tab'}
            onClick={() => {
              setAnalysis(analyze())
              setTab('inspect')
            }}
          >
            {t('build.tab.inspect')}
          </button>
        </div>
        <button type="button" className="jx-close" aria-label={t('build.aria.close')} onClick={onClose}>
          ×
        </button>
      </header>

      {/*
        The stop-loss line (§9.3). It names the two attempts and hands the user the three
        things that actually help — the advice list below it — rather than a bare "failed"
        that tells them nothing they can act on.
      */}
      {stopped ? (
        <p className="jx-repair-stopped" role="status">
          {t('run.repair.stopped')}
        </p>
      ) : null}

      {/*
        The key ask sits **below** the conversation, it never replaces it.

        Two reasons, and the second is the one that cost a defect: not only is the ask a
        turn in the same conversation as everything the user already wrote, a *repair*
        opens by sending its preset context message immediately — so on a machine with no
        key the first thing that happens is a `NOT_CONFIGURED`, and replacing the stream
        would hide the one sentence the repair exists to show. The user would land on a
        key form with no idea what they were in the middle of (found on a real device,
        stage 1-12 acceptance).
      */}
      {tab === 'chat' ? (
        <>
          <ChatStream
            introLine={introLine}
            conversation={state.conversation}
            phase={state.phase}
            proposal={state.proposal}
            escalation={state.escalation}
            escalationTrail={state.escalationTrail}
            advice={state.advice}
            error={state.error}
            validation={state.validation}
            usage={state.usage}
            suggestions={SUGGESTIONS}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => send(draft)}
            onSelectSuggestion={(label) => send(label)}
            onConfirm={confirm}
            // "Not quite" sends the user back to the composer with everything they wrote
            // still there: re-describing is a new turn in the same conversation, and
            // clearing the draft would make the user retype what they are refining.
            onRedescribe={() =>
              panelRef.current?.querySelector<HTMLTextAreaElement>('.jx-input')?.focus()
            }
            onReject={() => void session.rejectProposal(t('build.proposal.none'))}
            onPick={(field) => session.startPick(field)}
            onRetryStronger={() => void session.retryWithStrongerModel()}
          />
          {keyStep && keyRequest !== undefined ? (
            <KeyRequest
              {...keyRequest}
              cost={estimateBuildCost(analysis.visibleText.length)}
              onContinue={retryAfterKey}
              onDismiss={() => setKeyStep(false)}
            />
          ) : null}
        </>
      ) : (
        <InspectTab analysis={analysis} proposal={state.proposal} />
      )}

    </section>

    {state.proposal === null || overlay === null
      ? null
      : createPortal(
          <HighlightLayer
            fields={state.proposal.fields}
            containerSelector={state.proposal.containerSelector}
            query={query}
            token={state.highlightToken}
            pickingField={state.pickingField}
            disabled={state.phase !== 'awaiting-confirm'}
            onPick={(field) => session.startPick(field)}
          />,
          overlay,
        )}
    </>
  )
}
