# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until the first release, entries are grouped by **work area**, not by version.

## [Unreleased]

### Added

- **MV3 extension skeleton** — a WXT build with four entrypoints: background service worker, content script, popup and options. The permission set is fixed at `storage`, `activeTab`, `clipboardWrite` and `downloads` plus the `<all_urls>` host permission — never `tabs` and never `scripting`. `docs/ARCHITECTURE.md` §7.3 and a snapshot test pin it.
- **Tool DSL** (`packages/dsl`) — the §5.1 / §5.2 types, `matchUrl` with the §5.3 pattern semantics, a ReDoS-safe regex subset, and `validateToolDefinition` implementing all eight §5.4 rules. Every rejection carries a field-level `path`, a stable `code` and an English `message`.
- **Core contracts** (`packages/core`) — the message protocol (§7.2), the storage contract (§8.1) and the runtime contracts (§5.5). Types only, zero runtime dependencies.
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
