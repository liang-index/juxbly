/**
 * Category colour — `docs/UI_SPEC.md` §2.2 / §7.3.
 *
 * One map, so the result-header dot and the management page's Tool Identity dot can never
 * drift apart (AC 11: "same origin, same value"). The values live in `tokens.css` — this
 * file only names them, because a colour literal outside `tokens.css` is a recolor that
 * has to be hunted down later (UI_SPEC §11.4).
 */
import type { ToolCategory } from '@juxbly/dsl'

export const CATEGORY_COLOR: Record<ToolCategory, string> = {
  data: 'var(--jx-cat-data)',
  enhance: 'var(--jx-cat-enhance)',
  analyze: 'var(--jx-cat-analyze)',
  export: 'var(--jx-cat-export)',
}

export function categoryColor(category: ToolCategory): string {
  return CATEGORY_COLOR[category] ?? CATEGORY_COLOR.data
}
