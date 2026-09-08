/**
 * Timing of the highlight — `docs/UI_SPEC.md` §5.
 *
 * The build confirmation is the product's **one** signature moment: boxes light up in
 * sequence and fade into a soft glow. The numbers below are the token values
 * (`--jx-motion-signature` 600ms, `--jx-stagger` 70ms), restated as constants because the
 * animation delay is set inline per box and a component cannot read a custom property
 * through `style.animationDelay`.
 *
 * The restatement is asserted against `tokens.css` in a test, which is what keeps it from
 * becoming a second source of truth.
 *
 * Reduced motion is not optional (UI_SPEC §7.5 accessibility): the stagger collapses to
 * zero and the glow degrades to the instant fade.
 */
export const GLOW_MS = 600
export const STAGGER_MS = 70
export const REDUCED_GLOW_MS = 80

export function prefersReducedMotion(): boolean {
  // A host page can be opened in a context without `matchMedia` (jsdom, a detached
  // document); "no preference" is the honest default there.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Per-box delay. Index is the position in the sequence, so the chain reads top to bottom. */
export function glowDelayMs(index: number, reducedMotion = prefersReducedMotion()): number {
  return reducedMotion ? 0 : index * STAGGER_MS
}

export function glowDurationMs(reducedMotion = prefersReducedMotion()): number {
  return reducedMotion ? REDUCED_GLOW_MS : GLOW_MS
}

/** "70ms" → 70. Used by the token-parity test, not by the component. */
export function parseMs(value: string): number {
  const match = /^\s*([0-9.]+)ms\s*$/.exec(value)
  return match === null ? Number.NaN : Number(match[1])
}
