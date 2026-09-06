# Local Web Benchmark

The benchmark converts "Juxbly seems to work" into numbers the project can publish honestly. It is built in Phase 2 (stages 2-1 → 2-3) and lives in `tests/benchmark/`, executed by the runner in `apps/playground`.

## Why it exists

M0 ran 45 real-site cases: **20.0% correct, 37.8% partial, 42.2% wrong**. That result is why Juxbly is not positioned as a universal scraper, and why highlight confirmation exists at all. Anything that changes selector generation, page analysis, health, or repair must be measured against a fixed set — not against "I tried a few pages".

The benchmark's target is **task reliability, not site coverage**.

## Structure

The tree below is created with stage 2-1; until then nothing here exists on disk.

```text
tests/benchmark/
├── cases/            Task Corpus: one JSON per case (see contributing/BENCHMARK_GUIDE.md)
├── corpus/           Web Corpus: page snapshots, keyed by case id
├── ground-truth/     expected fields, item-count ranges, representative samples
├── results/          raw run output, one file per run, immutable
└── reports/          aggregated metrics, comparable over time
```

## Web Corpus policy

- **Snapshot minimally.** Store the HTML and assets needed to reproduce the task — not a full media archive. Prefer referencing live URLs where possible; snapshot when the page is too volatile or requires interaction state.
- **Redistribution rights matter.** Only snapshot pages you have the right to keep a copy of for testing. No login-gated or private content, no personal data.
- **ToS-sensitive targets are reviewed** before entering the corpus. This is a curated engineering corpus, not a scraping target list.
- **Volatility is expected.** A case records `verified_on`. When a site redesigns, mark the case stale and, where possible, re-snapshot rather than silently dropping it from the reported set.

## Metrics

Reported every run:

| Metric | Meaning |
|---|---|
| **Build Success Rate** | share of cases that end in a usable tool (the headline number) |
| Correct / Partial / Wrong | human-labelled distribution (`BENCHMARK_GUIDE.md`) |
| Correction Rate | how many confirmations needed user correction |
| Health false-positive rate | cases flagged degraded/broken on a page that had not actually broken |
| Repair success rate | repairs that produce a working new version |
| Latency and token cost | per case, for runs that used an `llm` step |

Bucket-level breakdown (`A`–`E`) is mandatory: an aggregate improvement that is really "B got better and C got worse" hides the truth.

## Honesty rules

- Never pick a threshold after seeing the results.
- Never drop failed cases from the reported set without saying so.
- Report the model, the date, and the corpus revision with every number.
- Published claims use the current measured value, even when it is unimpressive.

## CI integration

The benchmark runs on the shared-core trigger defined in [`../testing/TESTING.md`](../testing/TESTING.md). Results are stored per run so runs are comparable over time; the report shows the delta against the previous run.

Phase 3 entry depends on Build Success Rate reaching an honest, publishable baseline. That threshold is set from measured data in Phase 2 — it is not declared in advance.
