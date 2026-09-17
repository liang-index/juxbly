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
└── reports/          aggregated metrics — stage 2-3; judgement-template.md is stage 2-2
```

All four directories are populated as of stage 2-2. `cases/` and `ground-truth/` are separate files on purpose: a task is reworded when the wording turns out to be a hint, while ground truth is re-labelled when the page changes. Split them and a re-label cannot silently rewrite the task that produced it.

## Task Corpus and ground truth

**50 cases, labelled 2026-09-10 — every snapshot in the corpus has one.**

| Bucket | Cases | Corpus | Note |
|---|---|---|---|
| `A` regular structure | 12 | 12 | full coverage |
| `B` SPA routing | 10 | 10 | full coverage |
| `C` shadow DOM / custom elements | 10 | 10 | full coverage (M0's known weak spot) |
| `D` infinite scroll / lazy loading | 8 | 8 | full coverage |
| `E` hashed / CSS-in-JS classes | 10 | 10 | full coverage |

The stage required `A` and `C` end to end and three per other bucket. Every bucket ended up complete, because a half-labelled corpus gives a bucket-level breakdown with holes in it, and the bucket breakdown is the part that is actually read.

A case (`cases/A-01.json`) states the task **the way a user would type it** — "Collect every book listed on this page: the title, the price, whether it is in stock, and its star rating." No `.class`, no `#id`, no `querySelector`. A task that smuggles in the selector that answers it stops measuring Juxbly and starts measuring the prompt that was written. The health check rejects selector-shaped tasks outright.

Ground truth (`ground-truth/A-01.json`) carries `expected_fields`, an `item_count_range` and a `sample` of a few representative items, plus `verified_on`, `labelled_by`, `source` and an `amendments` log. Two rules keep it honest:

- **`item_count_range` is a band by default.** Pages change, and a fixed count manufactures false `wrong` labels — which then have to be "fixed" by re-labelling, the exact mechanism that corrupts a baseline. 44 of 50 cases are bands.
- **An exact count (`[20, 20]`) is allowed where the page is deterministic.** Six cases use one: `A-01` (20 books), `A-02` (10 quotes), `A-03` (3 rows), `A-04` (16 products), `C-09` (4 features), `E-02` (5 showcase items). All six are purpose-built test or demo pages whose item count is part of the page's own fixture rather than of the live web. The benchmark runs against a frozen snapshot, so a count cannot drift inside a run — but re-capturing one of these snapshots **re-opens the label**, and the `amendments` entry is not optional. An exact count is the most falsifiable range there is; that is the point, not a shortcut.
- **`sample` is representative, not exhaustive.** Whole-page dumps cannot be reviewed by a person, and they inflate the corpus.

### Judgement criteria

Each run is labelled by a **person**. There is no mechanical pass threshold, and correctness cannot be decided by "did it return rows" — the dominant M0 failure mode was not missing an element, it was grabbing the right element and reading the wrong thing out of it.

| Label | Meaning |
|---|---|
| `correct` | every expected field is present, and every value is right |
| `partial` | some fields or items are right, some wrong or missing |
| `wrong` | not usable: empty, structurally wrong, or semantically wrong |

How to apply them:

- **Hitting the element is not the same as getting the content.** A tool that selects the right card and returns the price as `"In stock"` is `wrong`, not `partial`. Judge the values against the sample, not the row count against the range.
- **Item count is evidence, not the verdict.** A count that lands in the range with wrong values is `wrong`; a count slightly outside the range with every value right is `partial` with a note, and the range gets re-examined separately.
- **Ties go to `partial`.** When a case sits between `correct` and `partial`, label it `partial` and say why in `notes`. Raising the bar mid-run is how a number drifts upward.
- **A field the page cannot produce is not a miss.** Some columns carry an icon and no text (D-08's Best Picture). If `notes` says so, a tool that reports it empty is not wrong; a tool that invents a value is.
- **Prompt injection is reported separately.** Output that carries page-instructed content is flagged as an injection observation and excluded from the distribution — it is a defence measurement, not a correctness one.
- **Uncompletable tasks stay in the set.** If the task cannot be done on that page at all, it is labelled `wrong` and kept: a negative case is data. It is never dropped for dragging a number down.

Every judgement is recorded in `tests/benchmark/reports/` using `judgement-template.md` — site, task, expected, actual, ground truth, label, latency, token cost, health, repair — so the same case judged twice can be compared and a drifting standard can be seen.

### Keeping it honest

| Command | What it does |
|---|---|
| `node scripts/check-cases.mjs` (`pnpm test:cases`) | case and ground-truth health check |

It asserts, and fails loudly on: required fields present in every case and every ground truth; ids unique, matching `<bucket>-<NN>`, and matching the case's own bucket; every case still pointing at the snapshot it claims — same url, same bucket, `index.html` present; one ground truth per case and one case per snapshot; `item_count_range` ordered, non-zero, and narrow enough that a tool can fall outside it; every declared field carrying a non-empty value in every sample item, and no sample item carrying a field the case did not declare; full `A`/`C` coverage and ≥3 elsewhere; no selector, DOM API or CSS fragment smuggled into a task description; and no credential, email or CJK in any sample.

A task may name the fields it wants — "the title, the price, whether it is in stock" is how a user asks. What it may not name is *how to find them*: a selector, a `class=`, a `data-` attribute, or `querySelector`. The ban is on implementation hints, not on the vocabulary of the request.

Ground truth is the baseline every later regression compares against. Re-labelling is allowed and expected when a page changes — it is recorded in `amendments` with a date and a reason, and never done to improve a number.

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
| Clarification Rate (proxy) | how many builds were preceded by a clarifying question — an offline stand-in for "needed user correction" (see below) |
| Health false-positive rate | cases flagged degraded/broken on a page that had not actually broken |
| Repair success rate | repairs that produce a working new version |
| Latency and token cost | per case, for runs that used an `llm` step |

Bucket-level breakdown (`A`–`E`) is mandatory: an aggregate improvement that is really "B got better and C got worse" hides the truth.

What each one counts, exactly, because "build success" can mean four different things:

| Metric | Counted as |
|---|---|
| **Build Success Rate** | the case generated a DSL that passed §5.4 validation, ran without an execution error, and returned at least one item. A tool that runs and finds nothing did not succeed |
| **Clarification Rate (proxy)** | the model answered with a clarifying question before it would build. Offline nobody can answer it, so the runner re-asks once with `noMoreQuestions` and records the flag. This is a **proxy** for the product's "user had to correct it" — the offline runner has no user, and it does not pretend otherwise. The JSON field keeps the historical name `correctionRate` so old result files stay readable |
| **Health false-positive** | of the cases that ran, those that were still reported as not healthy. A benchmark run is a tool's first run ever, so there is no history to deviate from: any non-healthy verdict here is a false positive by construction |
| **Repair success** | **not measured.** The runner does not repair — V1 forbids silent auto-repair, and a repair rate measured without a user deciding to repair would be a number about nothing. Reported as `not measured`, never as `0%` |
| **Latency / tokens** | per case, wall clock around generation plus execution; tokens are the sum of the proposal and the run |

## Honesty rules

- Never pick a threshold after seeing the results.
- Never drop failed cases from the reported set without saying so.
- Report the model, the date, and the corpus revision with every number.
- Published claims use the current measured value, even when it is unimpressive.
- A run where every case stopped with the same error measured nothing. It is an environment failure (unreachable endpoint, wrong key, no quota), not a `0%` baseline — the report says so at the top and the command exits non-zero. Delete that run's result before running again: the next run's delta is computed against the previous file, and a +60 pp improvement over an outage is a lie.

## Running it

```bash
JUXBLY_LLM_API_KEY=... pnpm test:bench                # the whole corpus
JUXBLY_LLM_API_KEY=... pnpm test:bench --case C-01   # one case
JUXBLY_LLM_API_KEY=... pnpm test:bench --bucket D    # one bucket
JUXBLY_LLM_API_KEY=... pnpm test:bench --limit 5     # a slice
```

`JUXBLY_LLM_BASE_URL` and `JUXBLY_LLM_MODEL` are optional (BYOK, so any OpenAI-compatible endpoint works; the default model is `gpt-4o-mini`). The key is read from the environment only — it is never written to a result, a report or a log.

Without a key the run is **skipped and says so**: no model call, exit 0, and CI leaves a "Benchmark skipped" note instead of a green tick that means nothing.

When the key is there but nothing gets through, the run **fails**: every case stops with the same error code, the report opens with "Not a benchmark result", and the command exits 1. Nothing is deleted for you — the failed result stays on disk as evidence, and the message names the file to remove before the next attempt.

Every run writes two files: `results/<run-id>.json` (raw, refused if it already exists) and `reports/<run-id>.md` (aggregated, with the delta against the previous run). Judgements go in `results/labels.json` as `LabeledResult` entries; until they are there the report says how many cases are pending and counts them as neither right nor wrong.

Model calls cost money, so nothing runs by itself: a pull request gets a 5-case slice (enough to catch a broken runner), and the full run that produces a publishable baseline is a deliberate `workflow_dispatch`.

## CI integration

The benchmark runs on the shared-core trigger defined in [`../testing/TESTING.md`](../testing/TESTING.md) — a change to `packages/dsl`, `runtime`, `capabilities`, `health`, `analyzer` or `repair`. Results are stored per run so runs are comparable over time; the report shows the delta against the previous run and is published as the job summary and an artifact.

The corpus health check is part of `pnpm test` today, because a corpus that has quietly drifted is worse than no corpus. The runner that produces the numbers is stage 2-3.

Phase 3 entry depends on Build Success Rate reaching an honest, publishable baseline. That threshold is set from measured data in Phase 2 — it is not declared in advance.
