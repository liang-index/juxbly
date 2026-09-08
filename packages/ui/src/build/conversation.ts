/**
 * The build conversation — `docs/ARCHITECTURE.md` §5.5 `ChatMessage`, §9.1 build flow.
 *
 * Pure and copy-free: the module holds no user-visible strings, so the wording lives in
 * `copy/` where it belongs (UI_SPEC §9.5) and the rules live here where they can be
 * asserted in a node-env test.
 *
 * The one rule that matters is the clarification cap. A model that keeps asking is not
 * being helpful, it is spending the user's patience: two rounds, then it must produce a
 * draft or a suggestion, however uncertain. That cap is enforced in two places on
 * purpose — the prompt is told to stop asking, and this module refuses to append a third
 * question even if one arrives.
 */
import type { ChatMessage } from '@juxbly/core'

/** Hard cap, not a suggestion: the third clarification is never shown. */
export const MAX_CLARIFICATION_ROUNDS = 2

/** How many clarification questions the assistant has asked so far. */
export function countClarifications(conversation: readonly ChatMessage[]): number {
  return conversation.filter(
    (message) => message.role === 'assistant' && message.isClarification === true,
  ).length
}

/** How many are still allowed. Never negative. */
export function clarificationsLeft(conversation: readonly ChatMessage[]): number {
  return Math.max(MAX_CLARIFICATION_ROUNDS - countClarifications(conversation), 0)
}

export function canAskMore(conversation: readonly ChatMessage[]): boolean {
  return clarificationsLeft(conversation) > 0
}

export function startConversation(request: string, at: string): ChatMessage[] {
  return [{ role: 'user', content: request.trim(), at }]
}

export function appendUser(conversation: readonly ChatMessage[], content: string, at: string): ChatMessage[] {
  return [...conversation, { role: 'user', content: content.trim(), at }]
}

export interface AssistantTurnOptions {
  /** Marks the turn as one of the two allowed clarification questions. */
  isClarification?: boolean
}

export function appendAssistant(
  conversation: readonly ChatMessage[],
  content: string,
  at: string,
  options: AssistantTurnOptions = {},
): ChatMessage[] {
  const turn: ChatMessage = { role: 'assistant', content, at }
  // `exactOptionalPropertyTypes`: the flag is either present or absent, never `undefined`.
  if (options.isClarification === true) turn.isClarification = true
  return [...conversation, turn]
}

/**
 * "None of these" — a rejection is a **turn in the same conversation**, not a reset.
 *
 * Clearing the history here would be the single most damaging thing this file could do:
 * the model would ask the same two questions again and the user would answer them again,
 * which is exactly the loop the cap exists to prevent. The rejection text is the user's
 * own words in the stream; it is passed in so the copy stays in `copy/`.
 */
export function appendRejection(
  conversation: readonly ChatMessage[],
  rejectionText: string,
  at: string,
): ChatMessage[] {
  return appendUser(conversation, rejectionText, at)
}
