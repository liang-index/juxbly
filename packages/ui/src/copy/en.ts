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
    search: 'Search your tools',
    search_aria: 'Search your tools by name or site',
    // A list view with nothing in it still has to say something (UI_SPEC §7).
    empty: 'No tools yet. Open a page, tell Juxbly what you need, and it shows up here.',
    empty_filtered: 'Nothing here matches that.',
    // The proactive help entry (§7.2): present for whoever looks, never pushed.
    help: 'How Juxbly works',
    help_aria: 'Open the Juxbly README',
    // The standing way into key management (§7.1): the overview is the toolbar surface,
    // so the settings entry has to be reachable without hunting through browser menus.
    settings: 'Settings',
    settings_aria: 'Open Juxbly settings',
    open_failed: 'That page could not be opened.',
    // The dot is never the only signal (§7.2): every row also carries the state in words.
    status: {
      healthy: 'Working',
      degraded: 'May need an update',
      broken: 'No longer reading this page',
    },
    never_used: 'Not used yet',
  },
  options: {
    heading: 'Juxbly settings',
    byok: {
      heading: 'Model access',
      // Says what the key is for before asking for it (§9: no unexplained demands).
      body: 'Juxbly calls the model with your own key. Reading a page and asking questions costs nothing.',
      key_label: 'API key',
      key_placeholder: 'Paste your key',
      key_aria: 'Your model API key',
      key_set: 'A key is saved',
      key_hint_aria: 'Saved key ending in',
      endpoint_label: 'Endpoint',
      endpoint_placeholder: 'https://api.openai.com/v1',
      endpoint_aria: 'OpenAI-compatible endpoint base URL',
      model_label: 'Model',
      model_placeholder: 'gpt-4o-mini',
      model_aria: 'Model name',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved.',
      save_failed: 'That could not be saved. Try again.',
      remove: 'Remove key',
      remove_aria: 'Remove the saved key',
      // Only visible after an explicit click (Security: the key is masked by default).
      show: 'Show',
      hide: 'Hide',
    },
    // The zero-cost path (PRODUCT §7.1). The wording names no provider and quotes no
    // allowance: a free tier is the provider's policy, and shipped copy that promises one
    // becomes wrong the day the policy changes.
    free: {
      note: 'Some providers offer a free tier, so this can cost nothing. Their terms change, so check them where you create the key.',
      link: 'Providers with a free tier',
    },
    connectivity: {
      test: 'Test connection',
      testing: 'Testing…',
      // The button is a spend: one minimal call, stated before it is made (§9 rule 4).
      cost: 'Sends one small request.',
      ok: 'Connected. The key and endpoint work.',
      // Three categories, three next steps (§9 rule 2) — never "the test failed".
      auth: 'The endpoint rejected that key. Check the key and try again.',
      network: 'The endpoint could not be reached. Check your connection, then try again.',
      endpoint: 'The endpoint answered, but not as an OpenAI-compatible API. Check the endpoint and model.',
      unknown: 'The test did not finish. Try again.',
      // The result is information, never a gate (edge cases: an offline user still configures).
      not_saved: 'You can still save this and test later.',
    },
    ball: {
      label: 'Show the floating ball',
      hint: 'Turning it off changes nothing else — Juxbly stays in the toolbar.',
    },
    // Three numbers, countable, and nothing invented (UI_SPEC §7.2 / §7.4).
    stats: {
      heading: 'Your usage',
      tools: 'Tools',
      added_this_week: 'Added this week',
      total_runs: 'Auto-runs to date',
      privacy: 'These numbers stay on this device. Juxbly sends no telemetry.',
    },
    manage: {
      heading: 'Your tools',
      // The management surface has no archive: a tool is here or it is gone (C1).
      empty: 'No tools yet.',
      delete: 'Remove',
      delete_aria: 'Remove this tool',
      confirm: 'Remove this tool?',
      confirm_body: 'It stops running on this page, and its earlier versions go with it.',
      confirm_ok: 'Remove',
      cancel: 'Keep',
      delete_failed: 'That could not be removed. Try again.',
    },
    /**
     * The version identity (stage 1-16): present so a bug report can name a build, and
     * deliberately *not* a brand slot — `text-meta` at the foot of the page, no logo.
     */
    version: {
      badge: 'v{version} · open source build',
    },
    /**
     * The feedback entry (stage 1-16, `PRODUCT.md` §9.2): two kinds of feedback, and
     * nothing attached automatically. The diagnostic line is shown and copied by the
     * person, never sent by the product — zero telemetry is a promise about what the
     * code does, not about what the user is allowed to share.
     */
    feedback: {
      heading: 'Feedback',
      body: 'Two ways to help. Nothing is attached automatically — you choose what to share.',
      problem: 'Report a problem',
      problem_hint: 'Something broke, or a tool stopped reading a page.',
      scenario: 'Suggest a scenario',
      scenario_hint: 'Something you wanted on a page and could not build.',
      open_issue: 'Open an issue on GitHub',
      open_discussion: 'Start a discussion on GitHub',
      diagnostic: 'Juxbly v{version} · {runtime} · open source build',
      diagnostic_short: 'Juxbly v{version} · open source build',
      copy: 'Copy diagnostic line',
      copied: 'Copied',
      copy_failed: 'That could not be copied.',
    },
  },
  onboarding: {
    // Node ②: one sentence, once (stage 1-13 Scope 1).
    intro: {
      line: 'I can see this page. Tell me what you want and I will try to build it — I will ask if anything is unclear.',
    },
    // Node ③: late, with a number and a way out.
    key: {
      heading: 'This next step calls the model',
      body: 'It runs on your own key. Reading the page and asking questions were free; this part is not.',
      create: 'Create a key',
      create_aria: 'Open the page where you create a model key',
      input_aria: 'Paste your model API key',
      paste: 'Paste your key',
      // Direct, and the retry ceiling is part of it: the user must not have to guess what
      // "let it retry" costs (PRODUCT §7.1 A4).
      cost: 'This build should cost about {amount}.',
      cost_retry: 'If it retries, the most this build can cost is {amount}.',
      stays: 'It stays on this device.',
      continue: 'Continue',
      not_now: 'Not now',
      format: {
        empty: 'Paste a key first.',
        too_short: 'That looks too short to be a key.',
        has_space: 'A key has no spaces — check what you pasted.',
      },
    },
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
    // The three tabs of the open-source panel (stage 1-16). Result is what everyone
    // gets; config and inspect are the surfaces a person who wants the seams can open.
    tab: {
      result: 'Result',
      config: 'Config',
      inspect: 'Inspect',
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
    /**
     * The config tab (stage 1-16): hand-editing the definition.
     *
     * `note` states the version rule before anyone types — "save" overwriting the
     * current definition in place is the one thing this surface must never appear to do
     * (`PRODUCT.md` §12: an edit is a new version, never an overwrite).
     */
    config: {
      note: 'Editing saves a new version — the old one is kept and can be restored.',
      editor_aria: 'Tool definition JSON',
      save: 'Save as new version',
      saving: 'Saving…',
      revert: 'Revert',
      saved: 'Saved as v{version}.',
      failed: 'That could not be saved. The draft is still here.',
      rejected: 'Can not save this definition:',
      invalid_json: 'That is not valid JSON.',
      rollback_done: 'Now using v{version}.',
      rollback_failed: 'That version could not be restored.',
    },
    /** The command chips (stage 1-16): a name for each, and a name for the row. */
    commands: {
      aria: 'Commands',
    },
    /**
     * The runtime inspect tab (stage 1-16). Field-level, and deliberately free of any
     * claim that the panel understood what it read — it reports what each step was
     * handed, what it wrote, and how long it took.
     */
    inspect: {
      note: 'Each step’s input, output and duration. Nothing here is written to logs.',
      empty: 'Nothing has run yet on this page.',
      input: 'Input',
      output: 'Output',
      duration: 'Duration',
      page: 'this page',
      cached: 'from cache — no model call',
      skipped: 'not reached',
      failed: 'failed',
      truncated: '+{count} more',
      ms: '{ms} ms',
      rows: '{count} rows',
    },
    /**
     * The capability summary (stage 1-16): a static read of the definition, shown before
     * anything runs. `sensitive` is the honest name for "this one leaves the device" —
     * the indirect-prompt-injection defence is only a defence if the person can see it.
     */
    capability: {
      heading: 'What this will do',
      extract: 'Read text from this page',
      extract_detail: '{count} fields',
      transform: 'Reshape the values it read',
      transform_detail: '{op}',
      llm: 'Send what it read to your model provider',
      llm_detail: '{task}',
      render: 'Draw the result in this panel',
      render_detail: '{view}',
      export: 'Write a file to your downloads',
      export_detail: '{format}',
      // Honesty, not a shrug: a custom instruction is exactly the case a static scan
      // cannot summarise, and saying so is the whole discipline (§9).
      custom: 'a custom instruction — this summary cannot tell you what it asks',
      unknown: 'One step is not a type Juxbly recognises, so it cannot say what it will do.',
      sensitive: 'Leaves this device',
      network: 'goes over the network',
      cookie: 'reads cookies',
      caveat: 'This is what the definition declares. Juxbly does not run it to find out.',
    },
    promise: {
      first: 'Next time you open this page, this shows up automatically.',
      recurring: 'Auto-runs on this page',
    },
    saved: 'Saved to your tools',
    undo: 'Don’t keep',
    // The ③ action area's three export actions (UI_SPEC §7.3). Success lines are light and
    // factual; the failure line points at the retry that is already on screen (§9).
    export: {
      copy: 'Copy',
      csv: 'CSV',
      json: 'JSON',
      copied: 'Copied',
      downloading: 'Download started',
      failed: 'The export failed. Try again.',
      aria: {
        copy: 'Copy result to clipboard',
        csv: 'Download result as CSV',
        json: 'Download result as JSON',
      },
    },
    // Repair (stage 1-12, ARCHITECTURE §9.3). The preset context message is *assembled* by
    // `packages/repair` from these three pieces — observed / cause / next (§9 rule 2: error
    // copy always points somewhere) — so the words stay translatable while the assembly
    // stays testable without React. A user-initiated rework carries no preset at all.
    repair: {
      context: {
        observed: 'This tool has started coming back empty',
        cause: 'the page may have changed',
        next: 'Want me to look at the current page structure and check these are still the fields you want?',
      },
      // Version notes, shown beside the entry in the rollback list.
      note_broken: 'Repaired after the page changed',
      note_edit: 'Edited by you',
      // The non-breakage entry into the same flow (§7.3 action area "change conditions").
      rework: 'Change what it collects',
      // Shown above the A4 advice list once a repair has failed twice (§9.3 stop-loss).
      stopped: 'I stopped after two attempts. One of these usually helps:',
    },
    // Recipe export (stage 1-12, PRODUCT §10.9.6). Desensitisation is a security boundary,
    // so the panel shows the JSON before anything is shared.
    recipe: {
      action: 'Export as Recipe',
      hide: 'Hide',
      preview_aria: 'Recipe preview',
      note: 'This is exactly what would be shared. Check it first.',
      copy: 'Copy',
      copy_aria: 'Copy the recipe JSON',
      download: 'Save file',
      download_aria: 'Download the recipe JSON',
      failed: 'The recipe could not be exported. Try again.',
    },
    discard: {
      confirm: 'Remove this tool?',
      confirm_body: 'It stops running on this page.',
      confirm_ok: 'Remove',
      cancel: 'Keep',
    },
    // Health presentation (UI_SPEC §7 / stage 1-11): degraded is a corner "?" that never
    // interrupts; broken is an error state with a direction and a repair CTA. The
    // per-case *reasons* come from the health engine (state machine), in English, and
    // are shown as-is — they are diagnostics, not locale copy.
    health: {
      aria: 'This tool may not be reading the page correctly',
      broken: 'This tool can no longer read this page.',
      repair: 'Fix this tool',
      // Degraded's way into the same flow (ruling B, 2026-09-09): the page changed, the
      // tool still runs, so the wording is "update", not "fix" — nothing is broken yet.
      update: 'Update this tool',
      retry: 'Refresh to try again.',
      check: 'Check once',
      checking: 'Checking…',
      check_failed: 'The check did not run. No status was changed.',
      check_ok: 'The content still looks right.',
      check_suspicious: 'The content does not look right.',
      tokens: 'tokens used',
      last_check: 'Last check',
    },
  },
  // The settings panel's version list (stage 1-12, C3): a plain list, no switcher UI, no
  // "was broken" badge — rollback is the only action and it is always secondary.
  config: {
    versions: {
      heading: 'Versions',
      current: 'in use',
      rollback: 'Roll back',
      rollback_aria: 'Roll back to version',
      empty: 'This tool has one version so far.',
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
