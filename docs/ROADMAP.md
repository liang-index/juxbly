# Roadmap

Juxbly is built as a sequence of **phases**, each made of **stages**. A phase is a
strategic step; a stage is the smallest unit that can be built and tested on its own.

This document fixes the order, the dependencies, and the acceptance boundaries. It does
not carry the engineering rules for a stage — those live in
[`CONVENTIONS.md`](CONVENTIONS.md) — nor the type contracts, which live in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

Reordering stages is a planning edit. Changing what a phase means, or the condition for
entering one, is a contract change and follows
[`contributing/DOC_CHANGE_PROTOCOL.md`](contributing/DOC_CHANGE_PROTOCOL.md).

**Current position** — Phase 0 is complete: the repository clones, builds, and is ready for
a first contribution. Phase 1 is under way; the Tool DSL (`packages/dsl`) and the core
contracts (`packages/core`) have landed.

---

## Phase 0 — repository and open-source foundation

Goal: a repository that can be cloned, built, and contributed to. Completing it is the
precondition for everything that follows.

| Stage | Content | Depends on | Acceptance |
|---|---|---|---|
| 0-1 repository init | git repository, `LICENSE` (AGPL-3.0 with the brand clause), `README.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `CHANGELOG.md` | — | after `git clone`, the README answers what it is, how to install it, how to run it, and how to contribute |
| 0-2 monorepo scaffold | pnpm workspace, `packages/* + apps/*` skeleton per `ARCHITECTURE.md` §4, TypeScript strict baseline, ESLint / Prettier, Vitest, CI (lint + typecheck + test) | 0-1 | CI is green; the empty packages build |
| 0-3 extension skeleton | WXT init, manifest (permissions exactly as `ARCHITECTURE.md` §7.3), empty background / content / popup / options entrypoints | 0-2 | Chrome loads the unpacked extension and the popup opens |
| 0-4 documentation stack | `ARCHITECTURE.md`, `UI_SPEC.md`, this document and `DEVELOPMENT.md` in the repository, plus the `CODE_MAP.md` maintenance convention | 0-1 | a contributor new to the project can set up locally from `DEVELOPMENT.md` alone |

---

## Phase 1 — the core tool engine, end to end

Goal: one user completes the whole lifecycle on a real page —
Discover → Build → Confirm → Save → Run → Deliver → Health → Repair → Version.

Dependency chain (`→` means "only after", `;` marks branches that can run in parallel):

```text
1-1 → (1-2 ; 1-3) → (1-4 ; 1-5 ; 1-6) → 1-7 → (1-8 ; 1-9) → 1-10 → (1-15 ; 1-11) → 1-12 → 1-13 → 1-16 → 1-14
```

| Stage | Content | Acceptance |
|---|---|---|
| 1-1 DSL package | `ToolDefinition` and the five step types, `validateToolDefinition` (all eight rules in `ARCHITECTURE.md` §5.4), `matchUrl` | unit tests cover every validation rule and the URL matching semantics, including subdomains and casing |
| 1-2 page analyser | `analyzePage`: visible-text simplification, structural features, **dynamic scanning of custom element tag names plus shadow-root expansion** | a fixture page with shadow DOM and custom elements produces a correct `PageAnalysis` |
| 1-3 browser adapter + storage | the `BrowserAdapter` interface with its Chrome and mock implementations; the three-key storage structure and its read/write API | no `chrome.*` import anywhere outside `packages/browser`; the mock carries the unit tests |
| 1-4 transform + render capabilities | `filter` / `sort` / `regex` / `dedupe` (structured conditions); `table` / `card` / `text` views | unit tests for the four operations; snapshot tests for the three views |
| 1-5 extract capability | CSS selector extraction (including inside shadow roots), `single` / `list` modes, three field types | integration test: hit counts and field values on a fixture page match ground truth |
| 1-6 LLM package (BYOK) | background-side client, prompt templates (**page content wrapped as a data section** — the injection defence), `TokenUsage` returned | a test asserts the API key never appears in the content script or in logs; mock `LlmPort` unit tests |
| 1-7 runtime engine | `ToolRuntime`: step orchestration, the variable bag, **LLM cache decision** (hash comparison, reuse when inputs are unchanged) | integration test: identical input skips the LLM call, changed input triggers it |
| 1-8 floating ball | six-state machine, idle split (static and translucent with no tools / one-shot pulse when tools match), edge snapping, global shortcut | state machine unit tests; visual check against `UI_SPEC.md` §6 |
| 1-9 build panel + highlight confirmation | chat panel, at most two clarification rounds, **the highlight layer (staggered glow — the one signature motion)**, click-to-correct, **local candidate scoring (A2, `ARCHITECTURE.md` §5.6)**, **the four-level failure escalation chain (A3/A4, including the visual fallback)** | end to end: natural language → DSL draft → highlight → confirm → saved at version 1 |
| 1-10 run panel | auto-appear on URL match, extract on every refresh, switching views does not re-run, manual refresh forces the full flow, token display, **the provenance block in the result area** (`UI_SPEC.md` §7.3), `ToolUsage` fields written (`ARCHITECTURE.md` §8.1), `first_tool_built` written on the first successful build | visual check plus integration tests; the result header shows tool name, category colour, run time, item count and tokens |
| 1-11 health + failure presentation | `evaluateHealth` (four layers; the structural layer uses container count and field-presence ratio in V1), the broken state with its CTA, the degraded badge, `run:report` | unit tests cover every state transition branch in `ARCHITECTURE.md` §10 |
| 1-12 repair + versioning | repair entry with prefilled context, reuses the build flow, version + 1, the old version stays available for rollback (**rollback lives in the config panel; there is no standalone version switcher UI**), **stop after two failures**, recipe export (redacted, with scenario metadata — `ARCHITECTURE.md` §5.5 `RecipeJson`) | end to end: change the page → broken → repair → new version → rollback works; the exported JSON contains no credentials or private data |
| 1-13 onboarding + overview + settings | four-step first-run guide (glow / opening line / delayed key request / first-build notice), the popup tool overview, the options page | each of the four steps fires once and only once (asserted through `OnboardingFlags`) |
| 1-15 export capability | three formats — `copy` (clipboard) / `csv` (download) / `json` (download) — with CSV injection protection; **registers the fifth capability at the registration point 1-7 leaves open**; writes `ToolUsage.export_count` / `last_export_at` (`ARCHITECTURE.md` §8.1) | CSV serialisation and injection unit tests, JSON serialisation unit tests; downloads go through the background (the content script only sends a message); `export_count` increments on success; all five capabilities present in the registry |
| 1-16 open-source interaction layer + feedback | three run-panel tabs (result / config / inspect), the `/edit` `/inspect` `/versions` commands, version identity, the capability summary, two kinds of feedback entry point | editing and saving config produces a new version that can be rolled back; every command has an equivalent clickable control; feedback never attaches page content automatically |
| 1-14 closed-loop acceptance | full-lifecycle run in `apps/playground` plus a manual dogfood smoke test on real pages | no blocker across the lifecycle; the delivery report lists known issues |

**Deliberately not in Phase 1**: chart views; webhook export (copy / CSV / JSON belong to
1-15); result history and the "last run vs this run" diff; Markdown export; in-session
`MutationObserver` watching; automatic repair; a confidence score (tested before
implementation and it did not predict correctness); remembering panel position; voice
input; conditional or looping steps; a JS sandbox or arbitrary script editing; tiered
appearance decay and the `Monitor` category; a standalone version switcher UI (rollback
lives in the config panel).

> 1-15 and 1-16 close gaps that surfaced while the sequence was written: 1-15 removes
> orphan values from `CapabilityPermission` (`clipboard.write`, `downloads`); 1-16 covers
> the open-source-only capabilities and the feedback entry points that no other stage
> owned.

> **A5 and A6 are not in this sequence.** A5 ("last run vs this run" diff on top of
> `RunState.last_result_fingerprints`) and A6 (local-model fallback through
> `chrome.languageModel`) are post-V1 iterations, expected during Phases 2–3 and ordered by
> real usage signals. V1 delivers only their prerequisites: the A5 data-port types (1-1,
> with the storage contract) and the A6 `LlmPort` interface shape (1-6). Neither behaviour
> ships in V1.

---

## Phase 2 — local web benchmark

| Stage | Content | Acceptance |
|---|---|---|
| 2-1 web corpus | real-site snapshot mechanism, copyright compliance policy, storage structure | enough site snapshots in the corpus to be representative |
| 2-2 task corpus + ground truth | a task description per site plus the annotation format and process for expected extraction results | annotation format reviewed; the first batch of ground truth complete |
| 2-3 runner + metrics | the benchmark runner (on `apps/playground`), core metrics such as Build Success Rate, regression in CI (trigger: shared-package change, `CONVENTIONS.md` §16) | CI publishes a metrics report; runs are comparable over time |
| 2-4 selector quality engineering | failure attribution taxonomy, single-variable prompt-side improvement with a before/after comparison, an assessment of what a site-adaptation library would look like | attribution report grouped by failure type, with evidence excerpts; at least one controlled improvement round; a build / do-not-build / undecided conclusion on the adaptation library |

---

## Phase 3 — dogfooding and Chrome Web Store release

Entry condition: Build Success Rate reaches an honest publishable baseline. The threshold
comes out of the Phase 2 data and is not set in advance.

- 3-1 maintainer dogfooding, with real usage data feeding back
- 3-2 store build (the Policy Surface narrows permissions and capabilities from the same
  core; CWS review limits do not constrain the open-source core)
- 3-3 CWS submission and release (store copy follows the copy discipline: no
  "universal scraper" style promises)

---

## Phase 4 — converging on the golden scenarios

Entry condition: real usage data — not lab data — has identified the high-frequency
scenarios worth polishing.

| Stage | Content | Acceptance |
|---|---|---|
| 4-1 rank and validate golden scenarios | a candidate pool (dogfooding, issues, CWS reviews, benchmark) filtered by five criteria, then validated on a small sample | at least one scenario confirmed as "build it" and converted into three or more benchmark cases |
| 4-2 preset library topic research | public demand signals (userscript install charts above all) → around 100 candidates → around 50 selected by four criteria | the shortlist is reviewable and exclusions state their reason; ToS and fragile-site handling reviewed case by case |
| 4-3 preset construction and curation | around 50 presets built during dogfooding, with curation metadata and a health baseline, redacted into the library | every preset runs, matches, and has a benchmark case; redaction checks pass |
| 4-4 recipe library, docs, and funnel work | scenario-based recipe library, an early-adopter guide, and work on time-to-first-tool and first-tool-to-second-tool | before/after comparison on real tasks; success rate does not regress |
| 4-5 localisation and language switching | locale switching (follow system, plus manual), a second language pack, `Intl` formatting, and a native-level proofread of the English copy | the key sets of `en` and the new locale match; a missing key fails the test and falls back to `en` at runtime; the longest string does not break the layout |

---

## Phase 5 — commercial validation

Entry condition: stable readings on the north-star metrics (7/30-day tool repeat usage,
repair success rate).

| Stage | Content | Acceptance |
|---|---|---|
| 5-1 north-star readings and monetisation candidates | stable readings (with an agreed aggregation frequency) plus demand evidence for five candidate offerings | at least four metrics have stable readings; every candidate is marked clear demand / insufficient evidence / not needed |
| 5-2 capability validation | a minimal viable validation for the candidates marked "clear demand" | every candidate is marked continue / pause / drop; the zero-telemetry position and the capability ceiling of the open-source core are intact |

Principle: monetisation follows real usage backwards. Subscription, quotas and managed AI
are all candidates, not assumptions. **The capability ceiling of the open-source core does
not narrow because of commercialisation** (the Policy Surface principle holds).

---

## Gates between phases

| Gate | Condition |
|---|---|
| Phase 2 → 3 | Build Success Rate reaches an honest baseline |
| Phase 3 → 4 | real usage data has identified the golden scenarios |
| Phase 4 → 5 | stable readings on 7/30-day tool repeat usage, time-to-first-tool, Tool Health false-positive rate, and repair success rate |
