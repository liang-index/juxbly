import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BrowserAdapter } from '@juxbly/browser'
import type { PageAnalysis } from '@juxbly/core'
import type { BallEvent } from '../floating-ball/ball-state'
import { HighlightLayer } from '../highlight/HighlightLayer'
import type { HighlightQuery } from '../highlight/highlight-layer'
import { containerFor, relativeSelector } from '../highlight/pick'
import { t } from '../copy'
import { ChatStream } from './chat'
import { InspectTab } from './inspect-tab'
import { createMessagingPorts } from './ports'
import { createBuildSession } from './build-session'
import type { CandidateScorer } from './build-session'

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

export interface BuildPanelProps {
  adapter: BrowserAdapter
  /** Re-read on demand: the page can change between two messages. */
  analyze: () => PageAnalysis
  /** The content script's shadow-piercing query. */
  query: HighlightQuery
  /** Where point-select clicks are captured (the content script passes `document`). */
  root: EventTarget
  scorer: CandidateScorer
  /** Optional: the mounted ball, so the flow is visible when the panel is not. */
  ball?: { send(event: BallEvent): void }
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
  ball,
  onClose,
  onSaved,
}: BuildPanelProps) {
  const session = useMemo(
    () =>
      createBuildSession({
        analyze,
        scorer,
        now: () => new Date().toISOString(),
        ...createMessagingPorts(adapter),
      }),
    [adapter, analyze, scorer],
  )

  const [state, setState] = useState(() => session.state())
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<'chat' | 'inspect'>('chat')
  const [analysis, setAnalysis] = useState<PageAnalysis>(() => analyze())
  const savedNotified = useRef(false)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => session.subscribe(setState), [session])

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

      {tab === 'chat' ? (
        <ChatStream
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
          // still there: re-describing is a new turn in the same conversation, and clearing
          // the draft would make the user retype the description they are refining.
          onRedescribe={() => panelRef.current?.querySelector<HTMLTextAreaElement>('.jx-input')?.focus()}
          onReject={() => void session.rejectProposal(t('build.proposal.none'))}
          onPick={(field) => session.startPick(field)}
          onRetryStronger={() => void session.retryWithStrongerModel()}
        />
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
