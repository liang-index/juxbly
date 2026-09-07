import type { ReactNode } from 'react'
import { en } from '../copy'
import { FieldValue } from './FieldValue'
import { ViewStatusNote } from './ViewState'
import type { ViewStatus } from './ViewState'
import { collectFields, limitRows } from './value'

/**
 * `render.view === 'table'` (`docs/ARCHITECTURE.md` §5.2).
 *
 * The default for list-shaped data (UI_SPEC §7.1). Columns are the union of the keys
 * across all rows, so a field that only some rows carry does not silently vanish.
 */
export interface TableViewProps {
  items: readonly Record<string, unknown>[]
  status?: ViewStatus
  error?: string
}

export function TableView({ items, status = 'ready', error }: TableViewProps): ReactNode {
  if (status !== 'ready') return <ViewStatusNote status={status} error={error} />

  const { rows, truncated } = limitRows(items)
  const fields = collectFields(rows)

  return (
    <div className="jx-view">
      {/* Rows scroll inside a capped box: the host page must stay usable. */}
      <div className="jx-view-scroll">
        <table className="jx-table">
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field} scope="col">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {fields.map((field) => (
                  <td key={field}>
                    <FieldValue value={row[field]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated ? <p className="jx-view-note">{en.views.moreRowsHidden}</p> : null}
    </div>
  )
}
