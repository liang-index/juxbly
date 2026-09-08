/**
 * `@juxbly/ui` — React UI: floating ball, panels, highlight layer, popup, options.
 * Module map: `docs/ARCHITECTURE.md` §4. Implementation constraints (Shadow DOM,
 * `jx-` prefixed class names and tokens): `docs/UI_SPEC.md` §11.
 */
export { copy, t, en } from './copy'
export type { Copy, CopyKey } from './copy'
export { mountReactRoot } from './mount'
export * from './views'
export { FloatingBall } from './floating-ball/FloatingBall'
export type { FloatingBallProps } from './floating-ball/FloatingBall'
export { mountFloatingBall } from './floating-ball/mount'
export type { FloatingBallHandle, FloatingBallOptions } from './floating-ball/mount'
export {
  createBallStateMachine,
  type BallState,
  type BallEvent,
  type BallStateMachine,
} from './floating-ball/ball-state'
export { computeSnapPosition, SNAP_TOP_RATIO, type SnapPosition } from './floating-ball/snap'
export { BuildPanel, type BuildPanelProps } from './build/BuildPanel'
export { mountBuildPanel, type BuildPanelHandle, type BuildPanelOptions } from './build/mount'
export {
  createBuildSession,
  MAX_PROPOSE_CALLS,
  SAVE_FAILED,
  VALIDATION_FAILED,
  type BuildAdvice,
  type BuildPhase,
  type BuildSession,
  type BuildSessionPorts,
  type BuildSessionState,
  type CandidateScorer,
  type EscalationLevel,
  type ProposeReply,
  type ProposeRequest,
  type SaveResult,
} from './build/build-session'
export {
  MAX_CLARIFICATION_ROUNDS,
  appendAssistant,
  appendRejection,
  appendUser,
  canAskMore,
  clarificationsLeft,
  countClarifications,
  startConversation,
} from './build/conversation'
export {
  applyFieldSelector,
  containerSelectorOf,
  extractStepOf,
  isDomHostile,
  looksHashed,
  proposalFields,
  toProposal,
  type BuildProposal,
  type ProposalField,
} from './build/proposal'
export { HighlightLayer, type HighlightLayerProps } from './highlight/HighlightLayer'
export {
  collectHighlightTargets,
  MAX_HIGHLIGHT_ROWS,
  remeasureTargets,
  type HighlightQuery,
  type HighlightTarget,
} from './highlight/highlight-layer'
export {
  GLOW_MS,
  REDUCED_GLOW_MS,
  STAGGER_MS,
  glowDelayMs,
  glowDurationMs,
  parseMs,
} from './highlight/glow'
export { containerFor, relativeSelector } from './highlight/pick'
export { categoryColor, CATEGORY_COLOR } from './run/category'
export { RunPanel, type RunPanelProps } from './run/RunPanel'
export { mountRunPanel, type RunPanelHandle, type RunPanelOptions } from './run/mount'
export { createRunPorts, type RunMessagingPorts } from './run/ports'
export {
  createRunSession,
  defaultView,
  resultRecords,
  spentTokens,
  type RunPhase,
  type RunSession,
  type RunSessionPorts,
  type RunSessionState,
  type RunStepOptions,
} from './run/run-session'
export { ResultHeader, relativeTime, type ResultHeaderProps } from './run/result-header'
export { TokenUsage, type TokenUsageProps } from './run/token-usage'
export { ViewSwitcher, type ViewSwitcherProps } from './run/view-switcher'
export { EmptyState } from './run/empty-state'
export { ErrorState, type ErrorStateProps } from './run/error-state'
export { PromiseLine, type PromiseLineProps } from './run/promise-line'
export { RetentionLine, type RetentionLineProps } from './run/retention-line'
