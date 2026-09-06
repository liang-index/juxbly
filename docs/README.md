# Documentation

Juxbly's documentation is a small stack. Each layer has one job and one owner file — no
concept is defined twice, because a second definition always drifts.

| Layer | Owner | Answers |
|---|---|---|
| 1 System | [`ARCHITECTURE.md`](ARCHITECTURE.md) | what the modules are, and what the type contracts are |
| 2 UI | [`UI_SPEC.md`](UI_SPEC.md) | what it looks like and how it behaves |
| 3 Engineering | [`CONVENTIONS.md`](CONVENTIONS.md) | how we write and review code |
| 4 Navigation | [`CODE_MAP.md`](CODE_MAP.md) | where a given thing lives |

Supporting documents:

| Document | Answers |
|---|---|
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | how to run it locally |
| [`contributing/SCOPE.md`](contributing/SCOPE.md) | what V1 deliberately does not do |
| [`contributing/CAPABILITY_GUIDE.md`](contributing/CAPABILITY_GUIDE.md) | how to write a capability |
| [`contributing/RECIPE_GUIDE.md`](contributing/RECIPE_GUIDE.md) | how to publish a recipe |
| [`contributing/BENCHMARK_GUIDE.md`](contributing/BENCHMARK_GUIDE.md) | how the Web Corpus benchmark works |
| [`contributing/DOC_CHANGE_PROTOCOL.md`](contributing/DOC_CHANGE_PROTOCOL.md) | how to change a shared contract |
| [`contributing/DOC_VISIBILITY.md`](contributing/DOC_VISIBILITY.md) | which documents are public and which stay internal |
| [`testing/TESTING.md`](testing/TESTING.md) | test layers and the regression rule |
| [`concepts/tool-lifecycle.md`](concepts/tool-lifecycle.md) | the lifecycle a tool moves through |
| [`architecture/README.md`](architecture/README.md) | architecture decision records |

## Conflict rules

When two documents disagree:

1. **Type contracts and module interfaces** win — `ARCHITECTURE.md`.
2. **UI behaviour** is defined by `UI_SPEC.md`, never by a prototype.
3. **Engineering practice** is defined by `CONVENTIONS.md`.
4. **Code** is the tiebreaker for anything a document leaves ambiguous. When code and
   document disagree, one of them is wrong: fix it and change the other in the same pull
   request.

Changing a contract that more than one document mentions goes through
[`contributing/DOC_CHANGE_PROTOCOL.md`](contributing/DOC_CHANGE_PROTOCOL.md).

## Reading order

| You want to | Read |
|---|---|
| run it locally | [`DEVELOPMENT.md`](DEVELOPMENT.md) |
| understand the system | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| find a module | [`CODE_MAP.md`](CODE_MAP.md) |
| add a capability | [`contributing/CAPABILITY_GUIDE.md`](contributing/CAPABILITY_GUIDE.md) |
| work on UI | [`UI_SPEC.md`](UI_SPEC.md) |
| know the boundaries | [`contributing/SCOPE.md`](contributing/SCOPE.md) |

## Language

Product-facing copy, code identifiers, comments and logs are English — the product
targets EU/US markets and V1 ships `en` only (`UI_SPEC.md` §9.5). Keyed copy lives in
`packages/ui/src/copy/`, so adding a language later is a locale change rather than a
refactor.

## Visibility

> **Rule documents are public. Methodology documents are not.**

A reader who needs a document to *use, build, or contribute to* Juxbly is looking at a rule
document, and it belongs here. A document only someone inside the project needs — a change
ledger, a per-stage construction ticket, an internal audit — is a methodology document, and
it lives in the internal repository rather than in this tree.

Public therefore means **English** — with one sanctioned exception: the closed set of
approved `README` translations listed in
[`contributing/DOC_VISIBILITY.md`](contributing/DOC_VISIBILITY.md). The full inventory, and
the rule for lifting a methodology conclusion into a public document without publishing the
document itself, is in that same file. CI checks the boundary
in `tests/unit/architecture/doc-visibility.test.ts`.

A consequence worth stating plainly: **a Chinese file in this tree is a methodology
document that escaped** — `README.zh-CN.md` and `README.ja.md` being the only exemption.

## Layout

```text
docs/
├── README.md              this file
├── ROADMAP.md             phase sequence and acceptance boundaries
├── ARCHITECTURE.md        type contracts, module interfaces
├── UI_SPEC.md             design tokens and component behaviour
├── CONVENTIONS.md         engineering conventions
├── CODE_MAP.md            module -> responsibility -> where to look
├── DEVELOPMENT.md         local setup
├── architecture/          decision records
├── assets/                screenshots referenced by README.md
├── benchmark/             Web Corpus
├── concepts/              supporting concept notes
├── contributing/          contribution guides
├── getting-started/       build-order walkthrough
├── recipes/               curated recipes
└── testing/               test layers
```
