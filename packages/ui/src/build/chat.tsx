import { t } from '../copy'
import type { TokenUsage, ValidationError } from '@juxbly/core'
import { SAVE_FAILED, type BuildAdvice, type BuildPhase, type EscalationLevel } from './build-session'
import type { BuildProposal } from './proposal'
import { SuggestionChips } from './suggestion-chips'
import type { SuggestionChip } from './suggestion-chips'
import type { ChatMessage } from '@juxbly/core'

/**
 * The conversation half of the build panel.
 *
 * It renders state and nothing else: every string comes from `copy/`, every decision was
 * made in `build-session.ts`. The one thing it owns is the composer's disabled rule — a
 * second send while a proposal is in flight would either duplicate a model call or strand
 * the first reply (UI_SPEC §7: Loading is mutually exclusive).
 */
export interface ChatStreamProps {
  conversation: readonly ChatMessage[]
  phase: BuildPhase
  proposal: BuildProposal | null
  escalation: EscalationLevel
  /** Every level the chain has fired this turn, in order — the visible trail (§9.1). */
  escalationTrail: readonly EscalationLevel[]
  advice: readonly BuildAdvice[]
  error: string | null
  /** Field-level reasons when a draft was rejected; empty the rest of the time. */
  validation: readonly ValidationError[]
  usage: TokenUsage | null
  suggestions: readonly SuggestionChip[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onSelectSuggestion: (label: string) => void
  onConfirm: () => void
  onRedescribe: () => void
  onReject: () => void
  onPick: (field: string) => void
  onRetryStronger: () => void
}

const ADVICE_KEYS: Record<BuildAdvice, 'build.advice.narrow-scope' | 'build.advice.rephrase' | 'build.advice.page-complex'> = {
  'narrow-scope': 'build.advice.narrow-scope',
  rephrase: 'build.advice.rephrase',
  'page-complex': 'build.advice.page-complex',
}

/** The one line a fired level is allowed to say. `none` and `stopped` say nothing. */
const LEVEL_LINE: Record<EscalationLevel, string | null> = {
  none: null,
  retry: t('build.escalate.retry'),
  vision: t('build.vision_fallback'),
  'stronger-model': t('build.escalate.strongerModel'),
  stopped: null,
}

/**
 * A rejection is only useful if it names the field. These messages come from the DSL
 * validator, whose `message` is user-facing English by contract (§5.5) — not from a
 * component and not from the page.
 */
function fieldReason(error: ValidationError): string {
  return error.path === '' ? error.message : `${error.path}: ${error.message}`
}

export function ChatStream({
  conversation,
  phase,
  proposal,
  escalation,
  escalationTrail,
  advice,
  error,
  validation,
  usage,
  suggestions,
  draft,
  onDraftChange,
  onSend,
  onSelectSuggestion,
  onConfirm,
  onRedescribe,
  onReject,
  onPick,
  onRetryStronger,
}: ChatStreamProps) {
  const busy = phase === 'analyzing' || phase === 'proposing' || phase === 'saving'
  const showSuggestions = conversation.length === 0

  return (
    <div className="jx-chat">
      <div className="jx-stream" role="log">
        {conversation.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={message.role === 'user' ? 'jx-msg is-user' : 'jx-msg'}
            data-clarification={message.isClarification === true ? 'true' : undefined}
          >
            {message.content}
          </p>
        ))}

        {busy ? <p className="jx-msg is-meta">{t(phase === 'analyzing' ? 'build.analyzing' : 'build.thinking')}</p> : null}

        {/* A level that fired stays on the record even after the chain moved past it:
            §9.1 forbids silent retries, and a level that flashed by for milliseconds was
            never seen. The current level renders again below, with its action. */}
        {escalationTrail
          .filter((level) => level !== escalation && LEVEL_LINE[level] !== null)
          .map((level) => (
            <p key={level} className="jx-msg is-meta">
              {LEVEL_LINE[level]}
            </p>
          ))}

        {escalation === 'retry' ? <p className="jx-msg is-meta">{t('build.escalate.retry')}</p> : null}
        {escalation === 'vision' ? <p className="jx-msg is-meta">{t('build.vision_fallback')}</p> : null}
        {escalation === 'stronger-model' ? (
          <p className="jx-msg is-meta">
            {t('build.escalate.strongerModel')}{' '}
            <button type="button" className="jx-link" onClick={onRetryStronger}>
              {t('build.escalate.retryStronger')}
            </button>
          </p>
        ) : null}

        {proposal !== null ? (
          <div className="jx-proposal" data-testid="proposal">
            <p className="jx-msg">{t('build.proposal.intro')}</p>
            <ul className="jx-fields">
              {proposal.fields.map((field) => (
                <li key={field.field}>
                  <button
                    type="button"
                    className="jx-field"
                    onClick={() => onPick(field.field)}
                    aria-label={`${t('build.aria.pick')} ${field.field}`}
                  >
                    <span className="jx-field-name">{field.field}</span>
                    <code className="jx-field-selector">{field.selector}</code>
                  </button>
                </li>
              ))}
            </ul>
            {proposal.evaluation !== null ? (
              <p className="jx-msg is-meta">
                {proposal.evaluation.hitCount} {t('build.proposal.matches')}
              </p>
            ) : null}
            <div className="jx-actions">
              <button type="button" className="jx-btn is-primary" disabled={busy} onClick={onConfirm}>
                {t('build.proposal.confirm')}
              </button>
              <button type="button" className="jx-btn" onClick={onRedescribe}>
                {t('build.proposal.redesign')}
              </button>
              <button type="button" className="jx-link" onClick={onReject}>
                {t('build.proposal.none')}
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'saved' ? <p className="jx-msg is-meta">{t('build.saved')}</p> : null}
        {usage === null ? null : (
          <p className="jx-msg is-meta" data-testid="usage">
            {usage.prompt_tokens + usage.completion_tokens} {t('build.tokens')}
          </p>
        )}
        {error === null ? null : (
          <p className="jx-msg is-error" data-testid="error">
            {validation[0] === undefined
              ? t(error === SAVE_FAILED ? 'build.error.save_failed' : 'build.error.generic')
              : fieldReason(validation[0])}
          </p>
        )}
        {advice.length > 0 ? (
          <div className="jx-advice">
            <p className="jx-msg is-meta">{t('build.advice.heading')}</p>
            <ul>
              {advice.map((item) => (
                <li key={item} className="jx-msg is-meta">
                  {t(ADVICE_KEYS[item])}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {showSuggestions ? (
        <SuggestionChips chips={suggestions} onSelect={onSelectSuggestion} disabled={busy} />
      ) : null}

      {phase === 'picking' ? (
        <p className="jx-msg is-meta" data-testid="picking">
          {t('build.pick.prompt')}
        </p>
      ) : null}

      <form
        className="jx-composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) onSend()
        }}
      >
        <textarea
          className="jx-input"
          rows={2}
          value={draft}
          placeholder={t('build.placeholder')}
          disabled={busy}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a newline. The composer is the one input where
            // Enter means "confirm the primary action" (UI_SPEC §8).
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!busy && draft.trim() !== '') onSend()
            }
          }}
        />
        <button type="submit" className="jx-btn is-primary" disabled={busy || draft.trim() === ''}>
          {t('build.send')}
        </button>
      </form>
    </div>
  )
}
