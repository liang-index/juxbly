# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until the first release, entries are grouped by **work area**, not by version.

## [Unreleased]

### Added

- **MV3 extension skeleton** — a WXT build with four entrypoints: background service worker, content script, popup and options. The permission set is fixed at `storage`, `activeTab`, `clipboardWrite` and `downloads` plus the `<all_urls>` host permission — never `tabs` and never `scripting`. `docs/ARCHITECTURE.md` §7.3 and a snapshot test pin it.
- **Tool DSL** (`packages/dsl`) — the §5.1 / §5.2 types, `matchUrl` with the §5.3 pattern semantics, a ReDoS-safe regex subset, and `validateToolDefinition` implementing all eight §5.4 rules. Every rejection carries a field-level `path`, a stable `code` and an English `message`.
- **Core contracts** (`packages/core`) — the message protocol (§7.2), the storage contract (§8.1) and the runtime contracts (§5.5). Types only, zero runtime dependencies.
- **Page analyzer** (`packages/analyzer`) — `analyzePage()` returns the §5.5 `PageAnalysis`: visible text simplified and cut to a character budget, repeating-unit container candidates with field-level candidates, a dynamic custom-element scan, and open shadow roots expanded. Read-only by construction: no DOM writes, no scrolling, no network, no model call.
- **Browser Adapter** (`packages/browser`) — the `BrowserAdapter` interface with a chrome implementation and an in-memory mock. Both run through one conformance suite, so "it passes in tests" keeps meaning something about the extension; the chrome implementation is stateless and looks the platform up per call, because an MV3 service worker is recycled without warning.
- **LLM package** (`packages/llm`) — the BYOK client (`callLlm`), the three-section prompt builder (`buildPrompt`: page content travels only in a wrapped data section — the §12.3 indirect-injection defence), nine `LlmError` categories the panels can tell apart, and the background side of `run:llm` / `run:llm_result` keyed by `requestId` with token usage attached. `api_key` is read in this package only: a source scan plus runtime assertions keep it out of the content script, the logs and every reply crossing back.
- **Storage** (`packages/storage`) — the three §8.1 keys behind a `BrowserAdapter`, with read-side defaults so a record written before `usage` existed still reads back complete, and an empty migration chain that already enforces version ordering.
- **Transform capability** (`packages/capabilities`) — filter / sort / regex / dedupe as local, deterministic ops with no permissions: a missing field never matches, mixed types sort by type instead of coercion, and every pattern passes the ReDoS safety subset before a single record is touched.
- **Render capability** (`packages/capabilities`) — mounts one of the three result views into Juxbly's own Shadow DOM mount point and nothing else. Zero records renders as a normal empty state, never an error.
- **Extract capability** (`packages/capabilities`) — `single` / `list` modes with `text` / `image` / `link` field types. Selectors pierce open shadow roots (closed ones are skipped, not probed); `image` reads `src` — falling back to the first `srcset` candidate — plus `alt`, and `link` reads `href` resolved to an absolute URL. An unparseable selector and a selector that matched nothing are deliberately different outcomes (`SELECTOR_SYNTAX` vs `hitCount: 0`), because health reads them on different layers. `pre_scroll` scrolls to the bottom first so lazy pages are not read one screen deep: capped at 10 rounds, stopped as soon as the page stops growing, and cancelled by the run's `AbortSignal`. Everything goes through `DomPort`, so the same code runs against a real page, a fixture and the candidate dry-run.
- **Result views** (`packages/ui`) — table / card / text views with the loading / empty / error split (`docs/UI_SPEC.md` §7). Values are rendered as text only, links require an `http(s)` URL, all colour comes from the §12 tokens, and long values and 500+ rows are capped.
- **Capability contracts** (`packages/core`, `packages/runtime`) — `CapabilityDefinition`, `ExecutionContext`, `RuntimePorts` and `CapabilityInput` (the step plus the records `input_from` resolves to), and a `CapabilityRegistry` that refuses duplicate step types.
- **Run engine** (`packages/runtime`) — `ToolRuntime` executes steps linearly, resolves `input_from` through a variable bag that rejects forward references and duplicate producers, and validates the definition before **every** run (a stored tool can be hand-edited in the open-source build). The llm cache decision is a stable 64-bit hash over a step's input data compared with `RunState.last_extract_hash`: unchanged data reuses the last output, and only an explicit `force` spends tokens again. A run returns `RunOutcome` — outputs, token usage, the render result, a `RunSummary` for health and the next `RunState` — and stores nothing itself; writing state stays with the caller. A cancelled run returns no state at all, so an abandoned run can never poison the cache.
- **LLM capability** (`packages/capabilities`) — the fourth registered capability. It owns no endpoint, no key and no prompt: it calls `RuntimePorts.llm`, which resolves to the background context, and returns the model's output together with what it cost. Its log line carries the task and the token counts, never the prompt or the output.
- **Shared logger** — every line carries a `[JUXBLY][<TAG>]` prefix, so it can be filtered out of a host page console. A content script shares its console with the page it runs on, so unprefixed logging would be hostile to whoever is debugging that page.
- **`docs/contributing/SCOPE.md`** — what V1 deliberately does not do, and why.
- **Web corpus** (`tests/benchmark/corpus/`) — 50 real-site snapshots across the five bucket classes (A 12 / B 10 / C 10 / D 8 / E 10). Each carries its `SnapshotMeta`, the measurement that put it in that bucket, and the robots.txt result actually fetched for it. There is one write path, `scripts/snapshot-site.mjs capture-sources`, and it refuses a site on any of four gates — robots, bucket verification, secret scanning, size. Health check: `pnpm test:corpus`.
- **Task corpus and ground truth** (`tests/benchmark/cases/`, `tests/benchmark/ground-truth/`) — one task per snapshot, written the way a user would ask it; the checker rejects task descriptions that leak selectors, DOM APIs or CSS fragments. Each task has a ground truth with an `item_count_range` narrow enough to be falsifiable, a representative `sample`, and provenance (`labelled_by` / `source` / `amendments`). The correct / partial / wrong judgement criteria live in `docs/benchmark/README.md`.
- **Benchmark runner** (`apps/playground/src/bench/`, `pnpm test:bench`) — runs the real pipeline over the corpus (snapshot → page analysis → propose → execute) and writes an immutable `results/<run-id>.json` plus a report carrying the corpus revision, model, date, failure excerpts and a delta against the previous run. Metrics are Build Success Rate, correct / partial / wrong, Clarification Rate (proxy), health false-positive rate, latency and tokens, every one of them split by bucket. The runner never judges a result itself: labels come from `results/labels.json`, and unlabelled cases count as `pending`. Without an API key it prints SKIPPED and exits 0. CI runs a 5-case slice on pull requests that touch the shared core; the full run is `workflow_dispatch`.
- **`":self"` field selector, and `FIELD_SELECTOR_EMPTY`** (`packages/dsl`, `packages/capabilities`) — `extract` reads every field with a selector relative to the container, and a container is never among its own `querySelectorAll` matches, so "the value is this element" was inexpressible; the benchmark showed the model writing `""` or `:self` for it anyway and failing the whole step after the rows had been found. A field selector may now be `":self"` (`docs/ARCHITECTURE.md` §5.2), and an empty one is rejected at validation as `FIELD_SELECTOR_EMPTY` (§5.4 rule 10) instead of throwing `SELECTOR_SYNTAX` mid-run. `":self"` was chosen over `self` — a valid type selector that would silently match nothing — and over `:scope`, real CSS whose `querySelectorAll` result legitimately excludes the scope element. It adds vocabulary, not control flow.
- **`MODEL_UNAVAILABLE` is its own `LlmErrorCode`** — a 403 is not a bad key. The endpoint accepted the key and refused the model (region or account), and filing it under `AUTH` sent the user to re-check the one thing that was already right. The connectivity test reports it as a fourth category with a next step that can work: try a different model.
- **Mechanical pre-labelling** (`scripts/prelabel.mjs`, `tests/benchmark/results/labels.json`) — the judged half of the benchmark needs 50 judgements per round, which no one can afford per iteration. The script proposes a label per case by comparing the run against each ground truth's `item_count_range` and `sample`, and writes a review table carrying the failing kind, a confidence and the evidence. It proposes; it does not judge. A case whose infrastructure failed stays `pending`, `structure-changed` is never assigned offline, and a label becomes real only when a person accepts it.

### Changed

- **`ValidationResult` is a discriminated union** (`{ ok: true; value } | { ok: false; errors }`). The previous shape could not carry `value` on success, which forced callers into casts or undefined checks at the only gate between model output and execution.
- **The content script mounts an empty, hidden `#juxbly-root`** with an open shadow root. This is the host the UI will render into; nothing is visible yet.

### Decisions worth knowing

- **Tool Health ships all four layers in V1** — execution, result, structure fingerprint and semantic. The earlier "structure fingerprint interface only, semantic later" position is superseded. Semantic is the only token-consuming layer: it fires on deviation only, is throttled, and its token cost is always shown.
- **Copy is English first** (the product targets EU/US markets). V1 ships `en` only, but the i18n structure — keyed copy in `packages/ui/src/copy/` — is in place from V1, so adding a language is a locale change rather than a refactor.
- **Result-first delivery**: the narrative is *describe a need → get the result → it is still there next time*. The result ships in front, the tool is attributed on the result itself, and keeping it is the default.
- **The benchmark reports what it measured, not what flatters it**: an environment failure (network, endpoint unreachable) is recorded as an error and excluded from the rate, never counted as a 0% result; and a metric the runner cannot observe — repair success rate, since the runner never repairs — is printed as *not measured* instead of 0%.
- **Silent auto-repair is out.** A failing tool is never rewritten in the background: repair produces a new, user-confirmed version and the old one stays available.
- **No confidence score.** It was trialled before implementation and did not predict correctness, so it is not in V1.
- **Build success is not correctness.** The benchmark's first judged run produced a tool for 90% of cases and a *correct* tool for 10%. Fixing a failure moves it to the next layer down rather than removing it — every round so far has traded build failures for field-semantics failures — so a benchmark report carries both numbers and failure composition, and a claim that the product improved is made about correctness, never about build success alone. Measurements and the rules for iterating are in `docs/architecture/selector-quality.md`.
- **A per-site selector knowledge library is deferred pending validation** — not rejected. None of the three measurements that would justify it exist yet: the same site failing the same way across two or more rounds, failure mass concentrated in a few sites rather than spread evenly, and a health signal that detects a break before a user reports it. The conditions are written into `docs/architecture/selector-quality.md` so the next pass is a measurement rather than an argument.

## Release notes format

Each release records:

- **Added**
- **Changed**
- **Fixed**
- **Breaking Changes** (if any)
- **Security Notes** (if any)

## Version and release policy

- Releases use explicit semantic versions.
- `main` is protected; changes reach it through review.
- A release is cut after the relevant acceptance criteria are verified.
