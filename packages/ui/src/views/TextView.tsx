import type { ReactNode } from 'react'
import { en } from '../copy'
import { ViewStatusNote } from './ViewState'
import type { ViewStatus } from './ViewState'
import { limitRows, truncateValue } from './value'

/**
 * `render.view === 'text'` (`docs/ARCHITECTURE.md` §5.2).
 *
 * The default for summary-shaped results (UI_SPEC §7.1), and the view that stays readable
 * when the data has no obvious shape: one line per record, `field: value` joined, no
 * table chrome to get in the way.
 *
 * Values are plain text here on purpose — a summary is something you read, not something
 * you click.
 */
export interface TextViewProps {
  items: readonly Record<string, unknown>[]
  status?: ViewStatus
  error?: string
}

export function TextView({ items, status = 'ready', error }: TextViewProps): ReactNode {
  if (status !== 'ready') return <ViewStatusNote status={status} error={error} />

  const { rows, truncated } = limitRows(items)

  return (
    <div className="jx-view">
      <div className="jx-text-view jx-view-scroll">
        {rows.map((row, index) => (
          <p className="jx-text-row" key={index}>
            {Object.keys(row)
              .map((field) => `${field}: ${truncateValue(row[field])}`)
              .join(' · ')}
          </p>
        ))}
      </div>
      {truncated ? <p className="jx-view-note">{en.views.moreRowsHidden}</p> : null}
    </div>
  )
}
