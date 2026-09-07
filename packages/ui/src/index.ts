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
export {
  createBallStateMachine,
  type BallState,
  type BallEvent,
  type BallStateMachine,
} from './floating-ball/ball-state'
export { computeSnapPosition, SNAP_TOP_RATIO, type SnapPosition } from './floating-ball/snap'
