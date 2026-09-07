/**
 * Edge snapping — stage 1-8. V1 snaps to the **right** edge only (prototype: a
 * right-half-pill hugging the window border, vertically at 52% of the viewport).
 *
 * Dragging and position memory are explicitly out of scope for Phase 1
 * (`task/stage-1-8.md` Do Not Implement), so this module is intentionally small: it
 * exists so the vertical clamp rule has exactly one definition for the content script
 * mount and the tests to share.
 */

/** Vertical anchor as a fraction of the viewport height (prototype: top 52%). */
export const SNAP_TOP_RATIO = 0.52

/** Minimum gap the ball keeps from the viewport's top and bottom edges. */
export const SNAP_VIEWPORT_MARGIN = 8

export interface SnapPosition {
  side: 'right'
  /** `top` in px for `position: fixed`, already clamped inside the viewport. */
  top: number
}

export function computeSnapPosition(viewportHeight: number, ballHeight: number): SnapPosition {
  const raw = viewportHeight * SNAP_TOP_RATIO - ballHeight / 2
  const max = Math.max(SNAP_VIEWPORT_MARGIN, viewportHeight - ballHeight - SNAP_VIEWPORT_MARGIN)
  const top = Math.min(max, Math.max(SNAP_VIEWPORT_MARGIN, raw))
  return { side: 'right', top }
}
