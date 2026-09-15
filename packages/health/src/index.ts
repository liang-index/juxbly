/**
 * `@juxbly/health` — breakage evaluation (`docs/ARCHITECTURE.md` §10, stage 1-11).
 *
 * Module map §4: this package decides, and only decides. Storage is written by the caller
 * (the background, through `packages/storage`) and repair belongs to 1-12. The split is
 * not tidiness — a health layer that could also write and also repair could not be tested
 * end to end, and the state machine is the part that has to be provably right.
 *
 * Everything exported here is pure.
 */
export { evaluateHealth } from './evaluate-health'
export { judgeExecution } from './execution-layer'
export { judgeResult } from './result-layer'
export { captureFingerprint, judgeStructure } from './fingerprint'
export { isSuspicious, judgeSemantic, shouldRunSemanticCheck, type SemanticTrigger } from './semantic'
export { capSample } from './sample'
export { nextStatus, type Transition, type TransitionInput } from './state-machine'
export {
  appendRun,
  type ExecutionLayer,
  type HealthEvaluation,
  type HealthInput,
  type HealthLayers,
  type ResultLayer,
  type SemanticLayer,
  type StructureLayer,
} from './types'
export type { ResultJudgement } from './result-layer'
export type { CaptureOptions, StructureJudgement } from './fingerprint'
export * from './constants'
