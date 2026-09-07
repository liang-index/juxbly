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
- **Shared logger** — every line carries a `[JUXBLY][<TAG>]` prefix, so it can be filtered out of a host page console. A content script shares its console with the page it runs on, so unprefixed logging would be hostile to whoever is debugging that page.
- **`docs/contributing/SCOPE.md`** — what V1 deliberately does not do, and why.

### Changed

- **`ValidationResult` is a discriminated union** (`{ ok: true; value } | { ok: false; errors }`). The previous shape could not carry `value` on success, which forced callers into casts or undefined checks at the only gate between model output and execution.
- **The content script mounts an empty, hidden `#juxbly-root`** with an open shadow root. This is the host the UI will render into; nothing is visible yet.

### Decisions worth knowing

- **Tool Health ships all four layers in V1** — execution, result, structure fingerprint and semantic. The earlier "structure fingerprint interface only, semantic later" position is superseded. Semantic is the only token-consuming layer: it fires on deviation only, is throttled, and its token cost is always shown.
- **Copy is English first** (the product targets EU/US markets). V1 ships `en` only, but the i18n structure — keyed copy in `packages/ui/src/copy/` — is in place from V1, so adding a language is a locale change rather than a refactor.
- **Result-first delivery**: the narrative is *describe a need → get the result → it is still there next time*. The result ships in front, the tool is attributed on the result itself, and keeping it is the default.
- **Silent auto-repair is out.** A failing tool is never rewritten in the background: repair produces a new, user-confirmed version and the old one stays available.
- **No confidence score.** It was trialled before implementation and did not predict correctness, so it is not in V1.

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
