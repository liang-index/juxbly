/**
 * Node ③ — asking for the key, late (`task/stage-1-13.md` Scope 1 + 2).
 *
 * The timing is the design. Reading the page and asking clarifying questions cost the
 * user nothing, so Juxbly does both before it ever mentions a key; the ask arrives when a
 * model call is actually next. A key screen at install time would be the first thing a new
 * user sees and the reason most of them leave.
 *
 * Two rules shape what the ask contains:
 *
 * - **The cost is a number, not a hedge.** "May incur costs" is the sentence a product
 *   writes when it does not want to commit to a figure. The number comes from the run's
 *   token estimate at call time, which is why this module formats one and never stores one.
 * - **No provider's free tier is named or quantified.** A free tier is the provider's
 *   policy and it changes without notice; hardcoding an allowance in shipped copy is a
 *   promise the product cannot keep, and the one thing a BYOK tool must not do is be
 *   wrong about what the user will be charged.
 *
 * Format checking is local on every path here. A key is never sent anywhere to be checked
 * — including to the endpoint it belongs to, until the user presses the test button.
 */
import type { OnboardingFlags } from '@juxbly/core'
import { shouldFire } from './flags'

/**
 * Where the user goes to get one. The copy beside it stays provider-neutral; the link is
 * the one concrete thing in the step, and OpenAI's key page is where an OpenAI-compatible
 * endpoint's key comes from by default.
 */
export const KEY_CREATE_URL = 'https://platform.openai.com/api-keys'

/** The repo README carries the provider list — the one place a policy can be corrected. */
export const FREE_TIER_URL = 'https://github.com/liang-index/juxbly#41-model-access-byok'

/** Long enough to be a key, short enough that a stray paste of something else is caught. */
const MIN_KEY_LENGTH = 8

export type KeyFormatError = 'empty' | 'too_short' | 'has_space'

export interface KeyFormatResult {
  ok: boolean
  error?: KeyFormatError
}

/**
 * Structural checks only — length and whitespace. There is deliberately **no prefix
 * check**: the endpoint is any OpenAI-compatible gateway, and those issue keys in at
 * least three shapes (`sk-…`, `sk-or-v1-…`, opaque strings). Rejecting a real key because
 * it lacks the prefix of one provider would be worse than accepting a typo the endpoint
 * reports a second later.
 */
export function validateKeyFormat(value: string): KeyFormatResult {
  const trimmed = value.trim()

  if (trimmed === '') return { ok: false, error: 'empty' }

  // Whitespace inside a key is always a bad paste — no provider issues one.
  if (/\s/.test(trimmed)) return { ok: false, error: 'has_space' }
  if (trimmed.length < MIN_KEY_LENGTH) return { ok: false, error: 'too_short' }

  return { ok: true }
}

/** Whether the step still owes the user its one appearance. */
export function shouldRequestKey(
  flags: OnboardingFlags | null,
  keySet: boolean,
): boolean {
  return shouldFire(flags, 'key', { keySet })
}

/**
 * `0.0043` → `$0.0043`; a sub-cent estimate is still the honest answer for a small build,
 * and rounding it up to a cent would overstate what the user is about to spend.
 *
 * Two decimals below a dollar is the wrong resolution for a figure this small, so small
 * amounts keep four and larger ones keep two — the point is that the digits are the
 * estimate's, not this function's.
 */
export function formatCost(usd: number): string {
  // Nothing to charge and nothing sane to print share one answer: a negative or NaN
  // estimate is a bug upstream, and `$0.00` is the least false thing to show for it.
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00'

  const cents = usd < 0.01
  return `$${usd.toFixed(cents ? 4 : 2)}`
}

export interface BuildCostEstimate {
  /** One call, at the reference rate. */
  single: string
  /** The A4 ceiling: every retry the chain may fire, worst case. */
  ceiling: string
}

/**
 * The pre-call estimate (PRODUCT §7.1).
 *
 * There is no price service and there will not be one: the estimate is page size times a
 * reference rate for the default class of model, and the word "about" in the copy is
 * doing real work. A provider changes a price and the figure drifts a little; it is
 * never presented as a quote, and the run's actual token count is what the panel reports
 * afterwards.
 */
const TOKENS_PER_CHARACTER = 0.25
const REFERENCE_RATE_PER_1K_TOKENS = 0.00015
/** The A4 chain: one call, one retry, one stronger model. */
const CEILING_CALLS = 3

export function estimateBuildCost(pageCharacters: number): BuildCostEstimate {
  const tokens = Math.max(0, pageCharacters) * TOKENS_PER_CHARACTER
  const single = (tokens / 1000) * REFERENCE_RATE_PER_1K_TOKENS

  return {
    single: formatCost(single),
    ceiling: formatCost(single * CEILING_CALLS),
  }
}
