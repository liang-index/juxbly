# Testing

Juxbly's tests exist to prove the parts that are easy to break quietly: validation, matching, the LLM cache decision, and the health state machine. Everything else is verified on real pages through the benchmark.

## Layers

| Layer | Scope | Location | Needs Chrome? | Needs network/key? |
|---|---|---|---|---|
| Unit | DSL validation rules, `url_pattern` matching, the four transform ops, LLM cache decision (hash comparison), health state-machine transitions | `tests/unit/` | no | no |
| Integration | `ToolRuntime` end-to-end on fixture HTML with a mock `BrowserAdapter` and a mock `LlmPort` | `tests/integration/` | no | no |
| Benchmark | Web Corpus snapshots + Task Corpus + ground truth, run from `apps/playground` | `tests/benchmark/` | no (runner) | yes (model) |
| Regression | the full benchmark set, triggered by shared-core changes | CI | no | yes |

Fixture HTML lives in `tests/fixtures/` and is part of the test contract: a fixture that no longer reproduces its bug is a bug in the fixture.

## Mocks are the point

Two mocks make the core testable without a browser:

- **Mock `BrowserAdapter`** — stands in for storage, clipboard, downloads, and DOM queries.
- **Mock `LlmPort`** — returns canned outputs and token usage, so a test can assert *whether* the model was called without calling it.

A test that needs real Chrome or a real API key belongs in the benchmark layer, not in unit or integration.

## Commands

```bash
pnpm test                        # unit + integration
pnpm test -- --watch
pnpm test tests/unit/dsl         # one directory
pnpm test:bench                  # benchmark (Phase 2+)
pnpm test:bench -- --case C-03   # one case
```

## Web Corpus

`tests/benchmark/corpus/` holds the snapshotted pages Phase 2 measures against, one directory
per case id. Two checks guard it, and they need different things:

| Check | Runs in | Needs |
|---|---|---|
| Corpus health — distribution, completeness, secret scan, offline loadability | `pnpm test` | nothing external |
| Snapshot capture — the pipeline that writes a snapshot | `pnpm test` (skipped without a browser) | Chromium, and network for a live site |

Capture is the only supported write path into the corpus (`scripts/snapshot-site.mjs`), and it
refuses rather than warns: a page whose bucket does not survive measurement, a path its
robots.txt forbids, a snapshot carrying a credential, and a snapshot containing CJK text — the
public tree stays CJK-free ([`DOC_VISIBILITY.md`](../contributing/DOC_VISIBILITY.md)) — are all
rejected with a reason and nothing is written. Nothing is overridable from the command line;
the one knob is `MAX_SNAPSHOT_BYTES` in `apps/playground/lib/corpus.mjs`, which is a reviewable
edit rather than a flag. Attributes whose name marks a credential slot
(`data-algolia-search-key`, `data-token-hash`, …) are dropped from the snapshot — the element
stays, the credential slot does not — because the repository's own secret scanner cannot tell a
client-side key from a leak, and CI runs it on the tree.

CI runs the health check. It does not download a browser, so the capture cases report as
skipped there; run `pnpm exec playwright install chromium` to exercise them locally.
`pnpm test:corpus` (equivalently `node scripts/check-corpus.mjs`) runs the whole health check on
its own, which is what a maintainer wants after touching `corpus-sources.mjs`.

## Naming

Test files mirror their source: `match-url.ts` → `match-url.test.ts`. Test names state the behaviour and the case, e.g. `it('rejects forward references to variables produced later')`.

## What each change must prove

| Change | Minimum evidence |
|---|---|
| Bug fix | a test that fails before the fix |
| DSL / validation | unit tests for the new rule plus its rejection message |
| Capability | unit tests per parameter branch + an integration test through `ToolRuntime` |
| Runtime / cache decision | integration test proving both branches (skipped and invoked) |
| Health | state-machine transition tests covering every branch in [`ARCHITECTURE.md` §10](../ARCHITECTURE.md) |
| Repair / versioning | an integration test proving the old version survives and can be rolled back |
| UI | state coverage per [`UI_SPEC.md` §7](../UI_SPEC.md) — only the states that apply to that component |

## Regression trigger rule

Run the full benchmark and report the delta when a change touches any of:

```text
packages/dsl
packages/runtime
packages/capabilities
packages/health
packages/analyzer
packages/repair
```

These are the shared core. A change there can silently degrade every existing tool, and no unit test will notice because no unit test runs against real sites.

CI enforces lint + typecheck + unit/integration on every PR. The benchmark runs on the trigger above, and its history is kept comparable run over run.

## Security assertions

Some invariants are checked by tests rather than review, because review forgets:

- No module outside `packages/browser` imports `chrome.*` — enforced by a lint rule plus a test that scans the source.
- No `eval` / `new Function` / remote script loading — enforced by scanning and by CSP configuration.
- The API key never appears in a content-script bundle or in log output — asserted by tests around `packages/llm` and the logger.
- Page content passed to a model is wrapped as a data section — asserted against `buildPrompt` output.

## Manual acceptance

Some things are verified by hand rather than automated: floating-ball states against [`UI_SPEC.md` §6](../UI_SPEC.md), the highlight confirmation animation, and end-to-end dogfooding on real pages. When a change affects one of these, say so in the pull request and describe what you checked — a green test run is not evidence that the floating ball still pulses.
