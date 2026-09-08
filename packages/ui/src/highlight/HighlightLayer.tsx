import { useEffect, useRef, useState } from 'react'
import { collectHighlightTargets, remeasureTargets } from './highlight-layer'
import type { HighlightQuery, HighlightTarget } from './highlight-layer'
import { glowDelayMs, glowDurationMs, prefersReducedMotion } from './glow'
import type { ProposalField } from '../build/proposal'

/**
 * The highlight layer — the product's one signature moment (UI_SPEC §7.5).
 *
 * Boxes are `position: fixed` inside Juxbly's shadow root and positioned from the target's
 * viewport rect, so they sit on top of the host page without ever being inserted into it.
 * Re-measuring on scroll and resize is not polish: a page that reflows while the user is
 * deciding would otherwise leave the boxes pointing at the wrong elements, and the whole
 * promise of the step is that what is lit up is what will be read.
 *
 * `token` replays the animation. It is bumped whenever the proposal changes, including a
 * point-select correction — the glow is the confirmation, so it runs again when the
 * confirmation changes.
 */
/** How far above the top edge a scrolled-to box comes to rest. */
export const SCROLL_MARGIN_PX = 120

export interface HighlightLayerProps {
  fields: readonly ProposalField[]
  containerSelector: string | null
  query: HighlightQuery
  /** Bump to redraw and replay. */
  token: number
  disabled?: boolean
  pickingField?: string | null
  onPick?: (field: string) => void
}

export function HighlightLayer({
  fields,
  containerSelector,
  query,
  token,
  disabled = false,
  pickingField = null,
  onPick,
}: HighlightLayerProps) {
  const [targets, setTargets] = useState<HighlightTarget[]>([])

  useEffect(() => {
    setTargets(collectHighlightTargets(fields, containerSelector, query))
  }, [fields, containerSelector, query, token])

  useEffect(() => {
    if (targets.length === 0) return

    let frame = 0
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setTargets((current) => remeasureTargets(current, containerSelector, query))
      })
    }

    // Capture phase, passive: the layer follows the page, it never intercepts it.
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
    }
  }, [targets.length, containerSelector, query])

  const reduced = prefersReducedMotion()

  // A box the user cannot see is a confirmation they cannot make (§9.1 edge case: the
  // target may be below the fold). Scrolled once per `token`, never per re-measure —
  // otherwise the layer would fight the user for the scroll position.
  const scrolledFor = useRef(-1)
  useEffect(() => {
    if (targets.length === 0 || scrolledFor.current === token) return
    if (targets.some((target) => target.rect.bottom > 0 && target.rect.top < window.innerHeight)) {
      scrolledFor.current = token
      return
    }

    const first = targets[0]
    if (first === undefined) return
    scrolledFor.current = token
    // Scrolled by rect, not by element: the layer holds no reference into the host page.
    window.scrollBy({
      top: first.rect.top - SCROLL_MARGIN_PX,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [targets, token, reduced])

  return (
    <div className="jx-highlight-layer" key={token} data-picking={pickingField === null ? undefined : 'true'}>
      {targets.map((target, index) => (
        <button
          type="button"
          key={`${target.field}:${index}`}
          className={
            pickingField === target.field ? 'jx-highlight is-picking' : 'jx-highlight'
          }
          data-field={target.field}
          disabled={disabled}
          aria-label={target.field}
          style={{
            top: `${target.rect.top}px`,
            left: `${target.rect.left}px`,
            width: `${target.rect.width}px`,
            height: `${target.rect.height}px`,
            animationDelay: `${glowDelayMs(index, reduced)}ms`,
            animationDuration: `${glowDurationMs(reduced)}ms`,
          }}
          onClick={() => onPick?.(target.field)}
        >
          <span className="jx-highlight-label">{target.field}</span>
        </button>
      ))}
    </div>
  )
}
