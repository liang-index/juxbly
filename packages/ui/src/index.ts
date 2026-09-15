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
export {
  mountBuildPanel,
  type BuildPanelHandle,
  type BuildPanelOptions,
  type BuildRepair,
} from './build/mount'
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
export { createRunPorts, type RunMessagingPorts, type WriteReply, type VersionHistory } from './run/ports'
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
export { PanelTabs, type RunTab, type PanelTabsProps } from './run/panel-tabs'
export { ConfigTab, type ConfigTabProps } from './run/config-tab'
export { parseDraft, stringifyDefinition, type DraftResult } from './run/config-draft'
export { VersionSection, type VersionSectionProps } from './run/version-section'
export { InspectTab, type InspectTabProps } from './run/inspect-tab'
export {
  stepViews,
  preview,
  rowCount,
  MAX_PREVIEW_ROWS,
  MAX_PREVIEW_CHARS,
  type StepView,
} from './run/inspect-steps'
export {
  CapabilitySummary,
  scanCapabilities,
  groupCapabilities,
  type CapabilityLine,
  type CapabilityGroups,
  type RiskReason,
} from './run/capability-summary'
export {
  createCommandRegistry,
  type CommandRegistry,
  type SlashCommand,
} from './commands/registry'
export { createRunCommands, ENTRY_IDS } from './commands/slash-commands'
export { VersionBadge, type VersionBadgeProps } from './options/version-badge'
export {
  FeedbackEntry,
  browserLabelOf,
  diagnosticLine,
  FEEDBACK_ISSUE_URL,
  FEEDBACK_DISCUSSION_URL,
  type FeedbackEntryProps,
} from './feedback/feedback-entry'
export { ResultHeader, relativeTime, type ResultHeaderProps } from './run/result-header'
export { TokenUsage, type TokenUsageProps } from './run/token-usage'
export { ViewSwitcher, type ViewSwitcherProps } from './run/view-switcher'
export { EmptyState } from './run/empty-state'
export { ErrorState, type ErrorStateProps } from './run/error-state'
export { PromiseLine, type PromiseLineProps } from './run/promise-line'
export { RetentionLine, type RetentionLineProps } from './run/retention-line'
export * from './onboarding'
export { Popup, SiteMark, type PopupProps, type SiteMarkProps } from './popup/Popup'
export {
  overviewRows,
  sortTools,
  filterTools,
  statusColor,
  statusCopyKey,
  MAX_OVERVIEW_ROWS,
} from './popup/tool-list'
export { createOverviewPorts, type OverviewPorts } from './popup/ports'
export { Options, BallToggle, UsagePanel, type OptionsProps } from './options/Options'
export { ByokForm, type ByokFormProps, type ByokFormState } from './options/byok-form'
export {
  createSettingsPorts,
  createManagePorts,
  type SettingsPorts,
  type ManagePorts,
} from './options/ports'
export {
  classifyConnectivity,
  CONNECTIVITY_COPY,
  type ConnectivityClass,
} from './options/connectivity'
