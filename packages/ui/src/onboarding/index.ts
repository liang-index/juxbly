/**
 * Onboarding — four one-shot nodes, no wizard (`task/stage-1-13.md` Scope 1).
 *
 * Each node is its own module and its own flag, because each fires in a different place:
 * the glow on the floating ball, the opening line in the conversation, the key request
 * before the first model call, and the first-build notice in the result area. They are
 * milestones with no order between them, and they are the entire onboarding surface — the
 * product ships no welcome screen, no step counter and no coach marks.
 *
 * Node ④ is the one module *not* here: its surface is the result area's promise line
 * (`UI_SPEC` §7.3 segment ④, built by stage 1-10), whose full sentence is exactly the
 * notice — "this will be here next time". A second line saying the same thing would be
 * the "do not explain twice" failure the provenance rules exist to prevent, so 1-13 owns
 * the milestone's *read* (`hasFired(flags, 'first-build')`) and nothing else.
 */
export * from './flags'
export * from './first-glow'
export * from './intro-message'
export * from './key-request'
export * from './KeyRequest'
