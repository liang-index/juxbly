import { describe, expect, it } from 'vitest'
import {
  appendAssistant,
  appendRejection,
  appendUser,
  canAskMore,
  clarificationsLeft,
  countClarifications,
  MAX_CLARIFICATION_ROUNDS,
  startConversation,
} from '@juxbly/ui'
import type { ChatMessage } from '@juxbly/core'

/**
 * `docs/ARCHITECTURE.md` §9.1: two clarification rounds, then a draft — no matter what.
 * `docs/UI_SPEC.md` §8: "None of these" is a turn in the same conversation, never a reset.
 */

const AT = '2026-09-07T00:00:00.000Z'

function clarification(content: string): ChatMessage {
  return { role: 'assistant', content, isClarification: true, at: AT }
}

describe('clarification cap', () => {
  it('allows exactly two clarification questions', () => {
    expect(MAX_CLARIFICATION_ROUNDS).toBe(2)

    const none = startConversation('Collect the products', AT)
    expect(countClarifications(none)).toBe(0)
    expect(canAskMore(none)).toBe(true)

    const one = appendAssistant(none, 'Which price?', AT, { isClarification: true })
    expect(countClarifications(one)).toBe(1)
    expect(canAskMore(one)).toBe(true)

    const two = appendAssistant(one, 'Which currency?', AT, { isClarification: true })
    expect(countClarifications(two)).toBe(2)
    expect(canAskMore(two)).toBe(false)
    expect(clarificationsLeft(two)).toBe(0)
  })

  it('counts only clarification turns, not every assistant message', () => {
    const conversation = appendAssistant(
      appendUser(startConversation('Collect the products', AT), 'done', AT),
      'Here is a proposal.',
      AT,
    )

    expect(countClarifications(conversation)).toBe(0)
    expect(canAskMore(conversation)).toBe(true)
  })
})

describe('appendAssistant', () => {
  it('marks a clarification turn, and leaves the flag off otherwise', () => {
    const conversation = appendAssistant(startConversation('q', AT), 'Which one?', AT, {
      isClarification: true,
    })
    expect(conversation[1]?.isClarification).toBe(true)

    const plain = appendAssistant(startConversation('q', AT), 'Here you go.', AT)
    // `exactOptionalPropertyTypes`: absent, not undefined — a consumer must be able to
    // tell "not a clarification" from a broken message.
    expect('isClarification' in (plain[1] as ChatMessage)).toBe(false)
  })
})

describe('appendRejection', () => {
  it('is a turn in the same conversation, never a reset', () => {
    const conversation = [
      ...startConversation('Collect the products', AT),
      clarification('Which price?'),
      clarification('The discounted one.'),
    ]

    const rejected = appendRejection(conversation, 'None of these', AT)

    // The history the model already used to ask two good questions survives: clearing it
    // would guarantee the same two questions come back.
    expect(rejected).toHaveLength(conversation.length + 1)
    expect(rejected[0]?.content).toBe('Collect the products')
    expect(countClarifications(rejected)).toBe(2)
    expect(canAskMore(rejected)).toBe(false)
    expect(rejected.at(-1)?.role).toBe('user')
  })

  it('trims the user text but never drops it', () => {
    const rejected = appendRejection(startConversation('a', AT), '  None of these  ', AT)
    expect(rejected.at(-1)?.content).toBe('None of these')
  })
})
