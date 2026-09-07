import type { ReactNode } from 'react'
import { en } from '../copy'

/**
 * The one non-data state renderer shared by all three views.
 *
 * `empty` and `error` look different on purpose: **0 rows is a normal answer** (the tool
 * ran, the page simply had nothing matching), while an error means the user has to do
 * something. Rendering an empty result as an error is the most common way a correct tool
 * ends up looking broken (`docs/UI_SPEC.md` §7).
 */
export type ViewStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface ViewStatusNoteProps {
  status: ViewStatus
  error?: string | undefined
}

export function ViewStatusNote({ status, error }: ViewStatusNoteProps): ReactNode {
  if (status === 'loading') {
    return <p className="jx-view-note">{en.views.loading}</p>
  }

  if (status === 'empty') {
    // No error class and no error colour — see file note.
    return <p className="jx-view-note">{en.views.empty}</p>
  }

  if (status === 'error') {
    return <p className="jx-view-note jx-view-note--error">{error ?? en.views.error}</p>
  }

  return null
}
