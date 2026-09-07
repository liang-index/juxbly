import type { ReactNode } from 'react'
import { en } from '../copy'
import { FieldValue } from './FieldValue'
import { ViewStatusNote } from './ViewState'
import type { ViewStatus } from './ViewState'
import { limitRows } from './value'

/**
 * `render.view === 'card'` (`docs/ARCHITECTURE.md` §5.2).
 *
 * The default for a single rich record (UI_SPEC §7.1): one card per row, field name above
 * value, so a record with many fields stays readable instead of becoming a wide table.
 */
export interface CardViewProps {
  items: readonly Record<string, unknown>[]
  status?: ViewStatus
  error?: string
}

export function CardView({ items, status = 'ready', error }: CardViewProps): ReactNode {
  if (status !== 'ready') return <ViewStatusNote status={status} error={error} />

  const { rows, truncated } = limitRows(items)

  return (
    <div className="jx-view">
      <div className="jx-cards jx-view-scroll">
        {rows.map((row, index) => (
          <div className="jx-card" key={index}>
            {Object.keys(row).map((field) => (
              <div className="jx-card-field" key={field}>
                <span className="jx-card-key">{field}</span>
                <span className="jx-card-value">
                  <FieldValue value={row[field]} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {truncated ? <p className="jx-view-note">{en.views.moreRowsHidden}</p> : null}
    </div>
  )
}
