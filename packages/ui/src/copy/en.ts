/**
 * English copy — the only locale V1 ships (`docs/UI_SPEC.md` §9.5).
 *
 * Every user-visible string is referenced by key from here; nothing is hardcoded in a
 * component. Language switching lands in stage 4-5, which is why the structure exists
 * now while the switcher does not.
 *
 * Voice rules: first person, short, no empty adjectives, no exclamation marks, and
 * error copy always points somewhere (`docs/UI_SPEC.md` §9).
 */
export const en = {
  extension: {
    name: 'Juxbly',
    description: 'Turn what you need on a page into a tool you can reuse.',
  },
  command: {
    toggleJuxbly: 'Show or hide Juxbly',
  },
  popup: {
    heading: 'Juxbly',
    body: 'Tools for this page will be listed here.',
  },
  options: {
    heading: 'Juxbly settings',
    body: 'Your model key and preferences will be set here.',
  },
  views: {
    loading: 'Loading…',
    // 0 rows is an answer, not a failure: no error styling, no apology (UI_SPEC §7).
    empty: 'No rows yet. Run this tool on a page that has what you described.',
    error: 'This view could not be drawn. Run the tool again to refresh it.',
    moreRowsHidden: 'Some rows are hidden to keep the page responsive.',
  },
} as const
