import type { TokenUsage } from '@juxbly/core'
import type { ReactNode } from 'react'
import { t } from '../copy'

/**
 * Token usage — `docs/UI_SPEC.md` §9 rule 4, BYOK transparency.
 *
 * Every real model call is paid for by the user, so the spend is shown when there is
 * spend. No call, no line: a cached run costs nothing, and "0 tokens" would read as a bug
 * rather than as good news.
 */
export interface TokenUsageProps {
  usage: TokenUsage | null
}

const NUMBERS = new Intl.NumberFormat('en-US')

export function TokenUsage({ usage }: TokenUsageProps): ReactNode {
  if (usage === null) return null

  return (
    <span className="jx-run-meta">
      {NUMBERS.format(usage.prompt_tokens)} {t('run.tokens.in')} /{' '}
      {NUMBERS.format(usage.completion_tokens)} {t('run.tokens.out')} {t('run.tokens.unit')}
    </span>
  )
}
