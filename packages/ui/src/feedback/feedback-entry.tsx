import { useState, type ReactNode } from 'react'
import { t } from '../copy'

/**
 * The feedback entry — `task/stage-1-16.md` Scope 7, `docs/PRODUCT.md` §9.2.
 *
 * Two kinds of feedback, because they are not the same thing and merging them loses
 * both: **a problem** (something broke, a tool stopped reading a page) and **a
 * scenario** (something the user wanted and could not build — the demand signal the
 * roadmap actually needs).
 *
 * What this component does *not* do is the security boundary:
 *
 * - **No network on open.** No fetch, no image, no prefetch — there is nothing to load.
 * - **Nothing is attached.** The two destinations are plain links; no page content, no
 *   tool definition, no run data, no identifier is appended to them. The diagnostic
 *   line is *shown*, and the user copies it by hand if they want it in their report —
 *   which is what "you choose what to share" has to mean in code (§13: zero telemetry
 *   is a property of the product, not a restriction on the person using it).
 *
 * The entry is a section of the settings page, not a modal step in the core flow:
 * feedback is somewhere to go, never something to get past (§9.2).
 */
export const FEEDBACK_ISSUE_URL = 'https://github.com/liang-index/juxbly/issues/new'
export const FEEDBACK_DISCUSSION_URL =
  'https://github.com/liang-index/juxbly/discussions/new?category=ideas'

/** The browser name and major version, or `null` when the user agent does not say. */
export function browserLabelOf(userAgent: string): string | null {
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent)
  const major = match?.[1]
  return major === undefined ? null : `Chrome ${major}`
}

export function diagnosticLine(input: { version: string; runtime: string | null }): string {
  return input.runtime === null
    ? t('options.feedback.diagnostic_short', { version: input.version })
    : t('options.feedback.diagnostic', { version: input.version, runtime: input.runtime })
}

export interface FeedbackEntryProps {
  /** The extension's manifest version — the only thing a report needs from the build. */
  version: string
  /** Injected so a test decides the label; falls back to the user agent at render time. */
  runtime?: string | null
  /** Clipboard is a port: the settings page owns it, this component only asks. */
  copy?(text: string): Promise<void>
}

export function FeedbackEntry({ version, runtime, copy }: FeedbackEntryProps): ReactNode {
  const label = runtime === undefined ? readUserAgent() : runtime
  const line = diagnosticLine({ version, runtime: label })
  const [copied, setCopied] = useState<boolean | null>(null)

  return (
    <section className="jx-options-section" data-role="feedback">
      <h2 className="jx-options-heading">{t('options.feedback.heading')}</h2>
      <p className="jx-options-note">{t('options.feedback.body')}</p>

      <div className="jx-feedback-paths">
        <div className="jx-feedback-path">
          <p className="jx-feedback-title">{t('options.feedback.problem')}</p>
          <p className="jx-options-note">{t('options.feedback.problem_hint')}</p>
          <a className="jx-link" href={FEEDBACK_ISSUE_URL} target="_blank" rel="noreferrer">
            {t('options.feedback.open_issue')}
          </a>
        </div>

        <div className="jx-feedback-path">
          <p className="jx-feedback-title">{t('options.feedback.scenario')}</p>
          <p className="jx-options-note">{t('options.feedback.scenario_hint')}</p>
          <a className="jx-link" href={FEEDBACK_DISCUSSION_URL} target="_blank" rel="noreferrer">
            {t('options.feedback.open_discussion')}
          </a>
        </div>
      </div>

      <div className="jx-feedback-diagnostic">
        <code className="jx-feedback-line">{line}</code>
        {copy === undefined ? null : (
          <button
            type="button"
            className="jx-link"
            onClick={() => {
              void copy(line).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }}
          >
            {t('options.feedback.copy')}
          </button>
        )}
      </div>

      {copied === null ? null : (
        <p className="jx-options-result" data-tone={copied ? 'ok' : 'error'}>
          {t(copied ? 'options.feedback.copied' : 'options.feedback.copy_failed')}
        </p>
      )}
    </section>
  )
}

/** Read at render time, not module scope: the panel is mounted in a real page, always. */
function readUserAgent(): string | null {
  if (typeof navigator === 'undefined') return null
  return browserLabelOf(navigator.userAgent)
}
