# Document Visibility

Not every document in this project is public. This file is the single source of truth for
which documents ship in the public repository and which do not — and it decides the
language of each.

## The rule

> **Rule documents are public. Methodology documents are not.**

One question separates them:

| If the answer is… | Then it is a |
|---|---|
| a reader needs it to **use, build, or contribute to** Juxbly | **rule document — public** |
| only someone **inside** the project needs it | **methodology document — internal** |

Put differently: a rule document states **what is true and what must hold**. A methodology
document records **how we arrived there and how we work**.

### Why the split exists

1. **Process is not product.** Decision ledgers, self-audits and per-stage construction
   tickets make a repository read like a lab notebook. They cost a reader attention and
   return nothing.
2. **Internal governance cannot be acted on from outside.** "Authorised by the maintainer
   on 2026-08-29" is meaningful to a handful of people. Published, it is noise — and it
   dates the sentence it sits in.
3. **Rule documents have to stay few, stable and English.** All three fail as soon as the
   process record is allowed to live beside them.

### Corollary — this is also the language rule

Rule documents are public and the product targets EU/US markets, so **rule documents are
English**. Methodology documents are internal, so they may stay Chinese.

That yields an unusually cheap check on the boundary:

> **A Chinese file in the public tree is a methodology document that escaped.**

The approved localized READMEs (next section) are the single, deliberately narrow exception.

Everything currently in Chinese is therefore on the internal list below — not because the
content is wrong, but because it is process.

## Inventory

### Rule documents — public

| Document | Defines |
|---|---|
| `README.md` | what this is, current status, install |
| `README.zh-CN.md`, `README.ja.md`, `README.pt-BR.md`, `README.es.md` | approved translations of `README.md` — see the localization rule below |
| `docs/README.md` | documentation stack navigation and conflict rules |
| `docs/ROADMAP.md` | phase sequence and acceptance boundaries |
| `docs/ARCHITECTURE.md` | type contracts and module interfaces |
| `docs/UI_SPEC.md` | design tokens and component behaviour |
| `docs/CONVENTIONS.md` | engineering conventions |
| `docs/CODE_MAP.md` | module → responsibility → where to look |
| `docs/DEVELOPMENT.md` | local setup |
| `docs/contributing/SCOPE.md` | what V1 deliberately does not do |
| `docs/contributing/CAPABILITY_GUIDE.md` | how to write a capability |
| `docs/contributing/RECIPE_GUIDE.md` | how to publish a recipe |
| `docs/contributing/BENCHMARK_GUIDE.md` | how to contribute a benchmark case |
| `docs/contributing/DOC_CHANGE_PROTOCOL.md` | how to change a shared contract |
| `docs/contributing/DOC_VISIBILITY.md` | this file |
| `docs/testing/TESTING.md` | test layers and the regression rule |
| `docs/concepts/tool-lifecycle.md` | the lifecycle a tool moves through |
| `docs/architecture/README.md` | architecture decision records |
| `docs/getting-started/README.md` | build-order walkthrough |
| `docs/recipes/README.md` | curated recipes |
| `docs/benchmark/README.md` | how the Web Corpus benchmark works |
| `docs/assets/` | screenshots referenced by `README.md` |
| `CONTRIBUTING.md`, `SECURITY.md`, `PRIVACY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `TRADEMARK.md`, `CHANGELOG.md` | standard project files |

### Methodology documents — internal

| Document | Why it stays inside |
|---|---|
| `task/**` | per-stage construction tickets: implementation notes, `Do Not Implement` lists, per-stage acceptance criteria |
| `docs/PRODUCT.md` | the deliberation record — what was considered, what was rejected, and why. **The conclusions are public**: they are stated in `README.md` and `contributing/SCOPE.md`. It is the *reasoning* that stays inside |
| `docs/DELTA.md` | change ledger — who changed what, and which stage it affects |
| `docs/MAINTAINER_RUNBOOK.md` | maintainer operations |
| `docs/testing/MANUAL_ACCEPTANCE.md` | the executable expansion of the per-stage acceptance criteria |
| `docs/testing/PHASE1_CLOSURE_REPORT.md` | the Phase 1 closure acceptance report: the maintainer-facing record of what was verified, what was measured, and the known-issues list. Its **conclusions** are public (they are in `README.md` and `CHANGELOG.md`); the report itself is the deliberation record |
| `docs/benchmark/*-spike-*.md` | pre-validation working notes; their conclusions already live in `README.md` |
| `docs/prototypes/` | the interactive prototype and its reader. A prototype is a **review tool, not part of the product**: `UI_SPEC.md` holds the rules, and `docs/assets/` carries the screenshots `README.md` needs |
| `.internal-repo` | the marker that tells the CI guard it is running in the internal repository. **It must never appear in this tree** — the guard fails if it does |
| `scripts/sync-public.mjs` | the maintainer tool that copies the public file set out of the internal repository. Only the internal side needs it, and it carries this inventory |
| `tsconfig.typecheck-tmp.json` | a session-local typecheck configuration that excludes two test files whose fixtures trip content scanners; it reflects no baseline a contributor needs |
| `AGENTS.md` | AI agent operating manual — internal governance and context-feeding rules |
| `standard-dev-workflow-prompt-v2-open-source.md` | personal AI development workflow prompt |
| `Juxbly_*.md` (repository root) | internal self-audit and competitive analysis |

Methodology documents live in the internal repository and are **never committed here**.

> `AGENTS.md` is the one entry above that a public project might be tempted to publish.
> If an agent-facing entry point is wanted publicly, write a short English subset under
> `CONTRIBUTING.md` — do not publish the operating manual.

## Promoting a conclusion, not the document

When a methodology document produces something readers need — a measured result, a settled
boundary — lift **the conclusion** into the rule document that owns it, and leave the
document itself internal.

Carry over: the number, the claim, the caveat.
Do not carry over: who decided it, when, or in response to which internal review.

Example: the ten-site selector quality spike stays internal. "Regular well-structured pages
are reliable; SPA and hashed class names are best effort" is stated in `README.md` with no
reference to the spike that produced it.

## Localized READMEs — the one sanctioned exception

`README.md` is English. It additionally ships as a closed set of approved translations:

| File | Language |
|---|---|
| `README.zh-CN.md` | Simplified Chinese |
| `README.ja.md` | Japanese |
| `README.pt-BR.md` | Brazilian Portuguese |
| `README.es.md` | Spanish |

Why these four: each sits at the intersection of a large developer population (GitHub
Octoverse 2025), a large Chrome desktop share, and low English proficiency (EF EPI 2025) —
the markets where an English-only README measurably loses readers. German and French are
deliberately absent: developers there read English comfortably, so a translation would be
pure maintenance cost. Hindi is absent for the same reason — Indian developers work in
English.

Rules for the set:

1. **English is authoritative.** Every translation carries a note saying so; translations
   follow the English original on a best-effort basis and may lag.
2. **README only.** No other document is translated. `docs/` stays English — translating
   the SSOT would fork the truth.
3. **The set is closed.** Adding or removing a language is a governance change: edit this
   file first, then the guard test, then `scripts/sync-public.mjs` — in that order, per
   `DOC_CHANGE_PROTOCOL.md`.
4. **Translation discipline.** Code blocks, commands, URLs, file paths and product names
   stay literal; prose, headings and image alt text translate. All files carry the same
   language-switcher row on the file's first line, above the `# Juxbly` heading: one
   `<kbd>` chip per language, the reader's own in bold, every other one a link.

## Enforcement

`tests/unit/architecture/doc-visibility.test.ts` fails the build when:

1. any tracked file contains CJK characters — exempt are the approved localized READMEs
   above (wholesale) and, inside every README, the single language-switcher row that
   rule 4 prescribes,
2. any tracked path contains non-ASCII characters,
3. any path on the internal inventory above is tracked.

The inventory exists in two places — this file and that test. **Change this file first**,
then the test, exactly as `contributing/DOC_CHANGE_PROTOCOL.md` requires of any contract.

### One codebase, two repositories

The internal working repository tracks the methodology documents on purpose, so the guard
would fail there forever for doing its job correctly. It skips itself when a `.internal-repo`
marker sits at the repository root. **The guard enforces the public tree, not the internal
one** — and that marker must never be copied into the public repository.
