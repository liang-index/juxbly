# Local Web Benchmark

The benchmark converts "Juxbly seems to work" into numbers the project can publish honestly. It is built in Phase 2 (stages 2-1 → 2-3) and lives in `tests/benchmark/`, executed by the runner in `apps/playground`.

## Why it exists

M0 ran 45 real-site cases: **20.0% correct, 37.8% partial, 42.2% wrong**. That result is why Juxbly is not positioned as a universal scraper, and why highlight confirmation exists at all. Anything that changes selector generation, page analysis, health, or repair must be measured against a fixed set — not against "I tried a few pages".

The benchmark's target is **task reliability, not site coverage**.

## Structure

```text
tests/benchmark/
├── cases/            Task Corpus: one JSON per case (see contributing/BENCHMARK_GUIDE.md) — stage 2-2
├── corpus/           Web Corpus: page snapshots, keyed by case id — built in stage 2-1
├── ground-truth/     expected fields, item-count ranges, representative samples — stage 2-2
├── results/          raw run output, one file per run, immutable — stage 2-3
└── reports/          aggregated metrics, comparable over time — stage 2-3
```

`corpus/` is populated. `cases/` and `ground-truth/` are empty on purpose: they are stage 2-2, and a half-filled Task Corpus would be indistinguishable from a finished one.

## The Web Corpus as it stands

**50 snapshots, captured 2026-09-10, 9.7 MB total.**

| Bucket | Count | Range | What the bucket holds |
|---|---|---|---|
| `A` regular structure | 12 | 10–12 | product grids, tables, documentation indexes |
| `B` SPA routing | 10 | 8–10 | client-side navigation confirmed by measurement, not by looks |
| `C` shadow DOM / custom elements | 10 | 8–10 | open shadow roots that carry content |
| `D` infinite scroll / lazy loading | 8 | 6–8 | content that only exists after the declared interaction |
| `E` hashed / CSS-in-JS classes | 10 | 8–10 | generated class names with no semantic anchor |

Each snapshot is a directory `corpus/<bucket>-<NN>/` holding `index.html`, `meta.json` and an `assets/` folder with the stylesheets the page needs. Ids are `<bucket>-<NN>` and are **never reused**.

`meta.json` carries the `SnapshotMeta` — `id`, `url`, `bucket`, `capturedAt`, `sizeBytes`, `verifiedOn` — plus the two things a snapshot cannot be judged without:

- **`bucketEvidence`** — the measurement that put the page in the bucket (`"18 of 159 shadow roots carry content"`, `"scrolling grew 1 repeated structure(s): div.post 20->60"`). A bucket is a fact, not a filing decision.
- **`rights`** — the basis on which we may keep a copy, and **`robots`** — the result of the live `robots.txt` pre-flight at capture time.

`verifiedOn` is the snapshot's expiry marker, not its creation date: it is the day the bucket property was last confirmed against the live page. When a site redesigns, this goes stale before the snapshot does.

### Keeping it honest

| Command | What it does |
|---|---|
| `node scripts/check-corpus.mjs` (`pnpm test:corpus`) | the whole health check — see below |
| `node scripts/snapshot-site.mjs capture-sources [--only A] [--skip-existing]` | re-capture; the **only** write path into the corpus |
| `node scripts/snapshot-site.mjs probe <url>` | measure a candidate page and print its bucket verdict without writing anything |
| `node scripts/snapshot-site.mjs probe-sources [--only C]` | re-run the bucket verdict for every listed source against the live web |

The health check asserts, and fails loudly on: the bucket distribution and the ≥45 floor; a complete `SnapshotMeta` with no duplicate ids or urls; the bucket property still being present in the file (a bucket-`C` snapshot whose shadow templates are empty is a bucket-`A` page wearing a harder label); every stylesheet the snapshot references being present; no credential and no personal data in any snapshot; and every snapshot being served offline by the playground with a DOM that is actually a document.

`corpus-sources.mjs` is the corpus as code — one entry per snapshot with the bucket it claims, its `rights`, and any interaction the runner has to replay. It also records the **rejected candidates and why** (a robots.txt `Disallow: /`, a licence that does not permit redistribution, a snapshot over the size cap, a page carrying a key-shaped placeholder), so a decision that was made is not silently revisited by the next person.

### Reproducing or changing a snapshot

1. `node scripts/snapshot-site.mjs probe <url>` — confirm the page still has the property the bucket claims.
2. Add or edit the entry in `scripts/corpus-sources.mjs` (new ids only; never reuse one).
3. `node scripts/snapshot-site.mjs capture-sources --only <bucket>`.
4. `node scripts/check-corpus.mjs`.
5. If a page no longer has the property, **replace it with a same-bucket site and say so in the report** — do not relabel it and do not quietly drop it from the set.

## Web Corpus policy

- **Snapshot minimally.** Store the HTML and stylesheets needed to reproduce the task — not a full media archive. Scripts are removed after rendering, and every `img` / `video` / `audio` source is replaced by a 1×1 placeholder; the DOM the task is measured against is unaffected.
- **Credential slots come out; the element stays.** Captured pages often carry a third-party key they publish on purpose — `data-algolia-search-key` on dev.to, `data-honeybadger-key`, ant.design's `data-token-hash`. None of them is a server credential, but a secret scanner cannot tell the difference: measured, the first capture of this corpus produced nine `generic-api-key` / `algolia-api-key` findings in two snapshots, which is enough to fail CI on a page nobody can author away. Capture drops attributes whose **name** marks a credential slot (`key`, `keys`, `token` or `secret` as a name segment) and the health check re-scans for them.
- **A bucket-`D` page has to grow *content*.** The growth measurement ignores `<style>` / `<script>` / `<link>` / `<meta>`: a lazy-loaded CSS chunk arriving is growth of the document, not of anything a tool would extract. Measured: without the rule, one page earned its bucket on `head|style 46->207`.
- **Redistribution rights matter.** Only pages we have the right to keep a copy of. Every snapshot records its basis: purpose-built scraping sandboxes, open-source project documentation, public-domain material, or a public login-free feed whose `robots.txt` permits the path and whose terms were reviewed. No login-gated or private content, no personal data.
- **`robots.txt` is enforced, not reviewed.** Capture fetches the live file and refuses a path its `User-agent: *` group disallows — longest matching rule wins, `*` and `$` included. A policy worth exactly as much as its enforcement is worth nothing.
- **Local fixtures are not a substitute.** `tests/fixtures/pages/` measures the parser; real sites measure the product. The corpus is the real-site half.
- **Size caps.** 1 MiB per snapshot, 300 KiB of CSS per snapshot, 48 MiB for the corpus. Exceeding a cap loses the page, not the cap.
- **No override flag.** Capture refuses rather than warns, and nothing is bypassable from the command line: `robots.txt`, the bucket verdict, the secret scan and the size cap are all absolute. Admitting an over-cap page means raising the documented cap in `apps/playground/lib/corpus.mjs`, which is a reviewable code change — a bypass flag on a command line is not.
- **CJK is normalized, not rejected.** A captured page may legitimately contain Chinese, Japanese or Korean text. Capture rewrites it as numeric character references (`&#x4E2D;`), which the HTML parser decodes back to the identical DOM, so the public tree stays CJK-free without biasing the corpus against multilingual pages.
- **Volatility is expected.** Re-snapshot and update `verified_on`; never drop a hard case because it drags a number down.

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

The corpus health check is part of `pnpm test` today, because a corpus that has quietly drifted is worse than no corpus. The runner that produces the numbers is stage 2-3.

Phase 3 entry depends on Build Success Rate reaching an honest, publishable baseline. That threshold is set from measured data in Phase 2 — it is not declared in advance.
