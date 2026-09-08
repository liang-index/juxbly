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
  ball: {
    aria: {
      // Default label (idle): the ball is a toggle, not a status report (prototype BALL screen).
      toggle: 'Open Juxbly',
      // Screen-reader-visible state semantics. Visually the six states are colour /
      // motion only (UI_SPEC §6 — "no text labels needed"); these labels are how that
      // state reaches assistive tech without adding an aria-live interrupt.
      state: {
        idle: 'Juxbly is idle',
        listening: 'Juxbly is listening',
        analyzing: 'Juxbly is analyzing the page',
        'awaiting-confirm': 'Juxbly is waiting for your confirmation',
        building: 'Juxbly is building the tool',
        error: 'Juxbly hit a problem',
      },
    },
  },
  popup: {
    heading: 'Juxbly',
    body: 'Tools for this page will be listed here.',
  },
  options: {
    heading: 'Juxbly settings',
    body: 'Your model key and preferences will be set here.',
  },
  build: {
    title: 'Build a tool',
    tab: {
      chat: 'Chat',
      inspect: 'Inspect',
    },
    placeholder: 'What do you need from this page?',
    send: 'Send',
    analyzing: 'Reading the page…',
    thinking: 'Working on it…',
    suggestions: {
      // Screen-reader name for the chip row; the chips themselves are model- or page-
      // derived and are not translated here.
      aria: 'Suggestions',
      heading: 'Try one of these',
      list: 'Pull this list into a table',
      prices: 'Collect names and prices',
      links: 'Collect titles and links',
    },
    proposal: {
      intro: 'I will read these fields:',
      confirm: 'Looks right',
      redesign: 'Not quite',
      none: 'None of these',
      matches: 'matches on this page',
    },
    pick: {
      prompt: 'Pick the element to read',
      cancel: 'Cancel',
      applied: 'Got it — the same pattern for the rest',
    },
    escalate: {
      retry: 'That did not match. Trying once more.',
      strongerModel: 'A stronger model may read this page better.',
      retryStronger: 'Try again',
    },
    advice: {
      heading: 'What you can try',
      'narrow-scope': 'Point at a smaller part of the page — one list, one column',
      rephrase: 'Describe what you want in different words',
      'page-complex': 'This page is hard to read structurally; a visual model may do better',
    },
    // UI_SPEC §7.3 pins this wording: the moment pixels may leave the machine, the user is told.
    vision_fallback: 'DOM analysis failed. Trying visual understanding.',
    saved: 'Saved. It will show up here next time.',
    tokens: 'tokens used',
    error: {
      generic: 'That did not work.',
      save_failed: 'I could not save this. Try again.',
    },
    aria: {
      close: 'Close Juxbly',
      pick: 'Pick an element for',
    },
  },
  /**
   * Run panel (`docs/UI_SPEC.md` §7 / §7.3). The promise line is the whole point of the
   * result area: it says out loud what the product did silently the first time.
   *
   * `run.undo` carries what §7.3 names `run.saved.undo` — the copy model is a flat
   * string per leaf, so `run.saved` (a string) cannot also be an object with `undo`
   * under it.
   */
  run: {
    aria: {
      panel: 'Juxbly tool',
      close: 'Collapse Juxbly',
      refresh: 'Run this tool again',
      view: 'Result view',
      switchTool: 'Switch tool',
    },
    // Loading is deliberately restrained: users expect a saved tool to feel instant,
    // and a build-style "analyzing" animation would promise work that is not happening.
    loading: 'Running…',
    // 0 rows is an answer, not a failure (§7): no error colour, no apology.
    empty: 'Nothing on this page matched this tool.',
    empty_hint: 'If the page has changed, refresh to look again.',
    stale: 'Showing the last result — this run did not finish.',
    error: 'This run did not finish.',
    error_next: 'Refresh to try again.',
    // Error copy always points at a next step (§9 rule 2).
    error_llm: 'The model call failed. Check your key and endpoint, then refresh.',
    error_validation: 'This tool’s definition is no longer valid.',
    refresh: 'Refresh',
    newTool: 'New tool',
    items: 'items',
    tokens: {
      in: 'in',
      out: 'out',
      unit: 'tokens',
    },
    time: {
      just: 'just now',
      minutes: 'min ago',
      hours: 'h ago',
    },
    view: {
      table: 'Table',
      card: 'Card',
      text: 'Text',
    },
    promise: {
      first: 'Next time you open this page, this shows up automatically.',
      recurring: 'Auto-runs on this page',
    },
    saved: 'Saved to your tools',
    undo: 'Don’t keep',
    discard: {
      confirm: 'Remove this tool?',
      confirm_body: 'It stops running on this page.',
      confirm_ok: 'Remove',
      cancel: 'Keep',
    },
  },
  views: {
    loading: 'Loading…',
    // 0 rows is an answer, not a failure: no error styling, no apology (UI_SPEC §7).
    empty: 'No rows yet. Run this tool on a page that has what you described.',
    error: 'This view could not be drawn. Run the tool again to refresh it.',
    moreRowsHidden: 'Some rows are hidden to keep the page responsive.',
  },
} as const
