import type { ReactNode } from 'react'
import { safeHref, truncateValue } from './value'

/**
 * One value in one cell.
 *
 * A link is only produced for an `http(s)` URL; everything else is text (`value.ts`).
 * The text is rendered by React, never through `innerHTML` — a page can put any string it
 * likes into a field, and the result area must never become an injection surface.
 */
export interface FieldValueProps {
  value: unknown
}

export function FieldValue({ value }: FieldValueProps): ReactNode {
  const href = safeHref(value)

  if (href !== null) {
    return (
      <a className="jx-link" href={href} target="_blank" rel="noreferrer noopener">
        {truncateValue(value)}
      </a>
    )
  }

  return <>{truncateValue(value)}</>
}
