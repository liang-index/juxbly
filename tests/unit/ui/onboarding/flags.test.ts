import type { OnboardingFlags } from '@juxbly/core'
import { describe, expect, it } from 'vitest'
import {
  en,
  estimateBuildCost,
  formatCost,
  hasFired,
  installGlow,
  introLine,
  NODE_OWNER,
  patchFor,
  shouldFire,
  shouldRequestKey,
  validateKeyFormat,
} from '@juxbly/ui'

/**
 * The four nodes — `task/stage-1-13.md` AC 1, `docs/ARCHITECTURE.md` §8.1.
 *
 * The hard line this file holds: **the four flags are independent one-shot facts, not a
 * progress bar.** Every "fires once" case below is an assertion about a single flag, and
 * every "independent" case proves that setting one bit neither reads nor moves another.
 */

const NONE = null

const ALL_TRUE: OnboardingFlags = {
  first_install_glow_shown: true,
  first_chat_opened: true,
  api_key_requested: true,
  first_tool_built: true,
}

const EMPTY: OnboardingFlags = {
  first_install_glow_shown: false,
  first_chat_opened: false,
  api_key_requested: false,
  first_tool_built: false,
}

/** No flags record at all — storage never written. Every node is still owed. */
describe('no flags record yet', () => {
  it('owes every node', () => {
    expect(shouldFire(NONE, 'glow')).toBe(true)
    expect(shouldFire(NONE, 'intro')).toBe(true)
    expect(shouldFire(NONE, 'key', { keySet: false })).toBe(true)
    expect(hasFired(NONE, 'first-build')).toBe(false)
  })
})

describe('node ① — first-install glow', () => {
  it('plays once, then never again', () => {
    expect(installGlow(EMPTY).play).toBe(true)
    expect(installGlow(ALL_TRUE).play).toBe(false)
  })

  it('is its own flag, not the has-tools pulse', () => {
    expect(hasFired({ ...ALL_TRUE, first_install_glow_shown: false }, 'glow')).toBe(false)
    expect(hasFired({ ...EMPTY, first_install_glow_shown: true }, 'glow')).toBe(true)
  })

  it('lasts longer than the has-tools pulse (900 ms) but is still a breath', () => {
    expect(installGlow(EMPTY).durationMs).toBeGreaterThan(900)
    expect(installGlow(EMPTY).durationMs).toBeLessThan(3000)
  })
})

describe('node ② — opening line', () => {
  it('is said the first time the panel opens and never again', () => {
    expect(introLine(EMPTY)).toBe('onboarding.intro.line')
    expect(introLine(ALL_TRUE)).toBeNull()
  })
})

describe('node ③ — late key request', () => {
  it('is owed before the first model call with no key configured', () => {
    expect(shouldRequestKey(EMPTY, false)).toBe(true)
    expect(shouldRequestKey(null, false)).toBe(true)
  })

  it('is not owed when a key already exists (flag and setting, double condition)', () => {
    expect(shouldRequestKey(EMPTY, true)).toBe(false)
    expect(shouldRequestKey(ALL_TRUE, false)).toBe(false)
    expect(shouldRequestKey(ALL_TRUE, true)).toBe(false)
  })

  it('checks the format locally and never for a prefix (any OpenAI-compatible issuer)', () => {
    expect(validateKeyFormat('')).toEqual({ ok: false, error: 'empty' })
    expect(validateKeyFormat('sk-1')).toEqual({ ok: false, error: 'too_short' })
    expect(validateKeyFormat('sk abcdefgh')).toEqual({ ok: false, error: 'has_space' })
    // Three real shapes: OpenAI, OpenRouter, a local gateway's opaque token.
    expect(validateKeyFormat('sk-proj-abcdef123456').ok).toBe(true)
    expect(validateKeyFormat('sk-or-v1-abcdef123456').ok).toBe(true)
    expect(validateKeyFormat('notamodelkey12345').ok).toBe(true)
  })
})

/**
 * Node ④ — the first-build notice.
 *
 * Its surface is the result area's promise line (`UI_SPEC` §7.3 segment ④), which shrinks
 * from the full sentence to a statement of fact the moment the flag flips. 1-13 therefore
 * ships no wording of its own here: a second sentence saying "this will be here next time"
 * is the duplication the provenance rules forbid. What 1-13 owns is the *read* — which
 * flag decides it, and that nobody else writes it.
 */
describe('node ④ — first-build notice', () => {
  it('is owed until a tool has actually run', () => {
    expect(hasFired(EMPTY, 'first-build')).toBe(false)
    expect(hasFired(null, 'first-build')).toBe(false)
    expect(hasFired(ALL_TRUE, 'first-build')).toBe(true)
  })

  it('belongs to the run layer, so 1-13 never writes it', () => {
    expect(NODE_OWNER['first-build']).toBe('stage-1-10')
    expect(NODE_OWNER.glow).toBe('stage-1-13')
    expect(NODE_OWNER.intro).toBe('stage-1-13')
    expect(NODE_OWNER.key).toBe('stage-1-13')
  })
})

describe('cost estimate (AC 2: a number, not a hedge)', () => {
  it('states the single-call figure and the A4 ceiling, the ceiling above the single', () => {
    const cost = estimateBuildCost(40_000)
    expect(cost.single).toMatch(/^\$\d/)
    expect(cost.ceiling).toMatch(/^\$\d/)
    expect(Number.parseFloat(cost.ceiling.slice(1))).toBeGreaterThan(
      Number.parseFloat(cost.single.slice(1)),
    )
  })

  it('keeps sub-cent figures honest instead of rounding up to a cent', () => {
    expect(formatCost(0.0015)).toBe('$0.0015')
    expect(formatCost(0.25)).toBe('$0.25')
  })
})

/**
 * The free-tier discipline (`task/stage-1-13.md` Scope 2, 2026-09-08): the UI may say a
 * free tier exists, and may not name a provider, an allowance, or a permanence. A quota
 * written into shipped copy becomes wrong the day the provider changes its policy — the
 * one thing a BYOK tool must never be is wrong about money.
 */
describe('free-tier copy discipline', () => {
  it('says a free tier can exist and promises nothing about it', () => {
    const texts = JSON.stringify([en.onboarding, en.options.free])

    expect(/free tier/i.test(texts)).toBe(true)
    expect(/permanent|forever|unlimited|always free/i.test(texts)).toBe(false)
    expect(/\$\s?\d/.test(texts)).toBe(false)
    expect(/openai|openrouter|google|anthropic/i.test(texts)).toBe(false)
  })
})

describe('independence (AC 1: not a linear progress)', () => {
  it('setting one bit leaves the other three untouched', () => {
    expect(patchFor('glow')).toEqual({ first_install_glow_shown: true })
    expect(patchFor('intro')).toEqual({ first_chat_opened: true })
    expect(patchFor('key')).toEqual({ api_key_requested: true })
  })

  it('each node decides on its own bit alone', () => {
    // Every other milestone done: node ① is still owed until its own bit is set.
    const onlyGlowMissing: OnboardingFlags = {
      first_install_glow_shown: false,
      first_chat_opened: true,
      api_key_requested: true,
      first_tool_built: true,
    }
    expect(installGlow(onlyGlowMissing).play).toBe(true)

    // Only node ① done: node ③ is still owed.
    const onlyGlowDone: OnboardingFlags = {
      first_install_glow_shown: true,
      first_chat_opened: false,
      api_key_requested: false,
      first_tool_built: false,
    }
    expect(shouldRequestKey(onlyGlowDone, false)).toBe(true)
    expect(introLine(onlyGlowDone)).toBe('onboarding.intro.line')
  })
})
