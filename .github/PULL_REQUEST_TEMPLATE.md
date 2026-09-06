<!--
PR title convention: `<stage-or-area>: <summary>` — e.g. `1-5: add shadow-DOM piercing to extract`.

One logical change per PR. If you found something "easy to do while here", open an issue instead of folding it in.
-->

## 1. Change Summary

<!-- What changed, and why. Link the issue: Closes #NNN -->

## 2. Files Changed

<!-- Grouped by package/module when non-trivial -->

## 3. Architecture Impact

<!-- Does this add/modify a DSL type, message field, or capability I/O?
     If yes, `docs/ARCHITECTURE.md` must be updated in this same PR — state the section. Write "None" if not. -->

## 4. Self-check Results

<!-- Scope discipline: confirm nothing outside the agreed scope was implemented (see the issue
     and docs/contributing/SCOPE.md). Security invariants held (no eval, no chrome.* outside
     packages/browser, no key in content script/logs).
     If this PR adds a document: confirm it is a rule document, not a methodology document
     (see docs/contributing/DOC_VISIBILITY.md). -->

## 5. Test Results

<!-- `pnpm typecheck && pnpm lint && pnpm test` output summary. New behaviour is covered by which tests?
     List any Acceptance Criteria you could NOT verify yourself. -->

## 6. Benchmark / Regression Results

<!-- Required if this touches packages/dsl, runtime, capabilities, health, analyzer, or repair (see docs/testing/TESTING.md).
     Write "Not applicable" otherwise. -->

## 7. Risks / Known Issues

## 8. Anything Not Implemented
