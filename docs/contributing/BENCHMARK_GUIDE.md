# Benchmark Case Contribution Guide

Benchmark cases are **the most valuable early contribution** to Juxbly: they require no core code changes, and they are what turns "Juxbly seems to work" into a number the project can be honest about.

Juxbly's benchmark has two layers, and both matter:

```text
Web Corpus   (a fixed set of pages/sites, snapshotted)
     +
Task Corpus  (a fixed set of real tasks, with ground truth)
     =
Benchmark    (repeatable, comparable over time)
```

The target is not "how many sites are supported". It is **whether core tasks are reliable**.

## Difficulty buckets

Every case declares the bucket it exercises. Coverage across buckets matters more than raw case count.

| Bucket | Code | What it stresses | Examples |
|---|---|---|---|
| Regular structure | `A` | tables, lists, semantic HTML | Hacker News, Wikipedia tables, Product Hunt |
| SPA routing | `B` | client-side routing, late-rendered DOM | Linear changelog, public Notion pages |
| Shadow DOM / Web Components | `C` | custom element tag names, open shadow roots | Reddit (`shreddit-*`), YouTube (`ytd-*`) |
| Infinite scroll / lazy loading | `D` | content that only exists after interaction | Unsplash, Pinterest |
| Hashed / CSS-in-JS classes | `E` | selectors with no semantic anchor | pages with `.sc-xxxx`, `.module_abc123` |

Before submitting a `B` or `C` case, verify the page still actually has the property (no full page reload on navigation; a real `#shadow-root` in DevTools). If it no longer does, pick another site in the same bucket.

## Case format

A case is **two files**, not one. The task lives in `tests/benchmark/cases/<id>.json` and the ground truth in `tests/benchmark/ground-truth/<id>.json`. They are split because they change for different reasons: a task is reworded when the wording turns out to be a hint, while ground truth is re-labelled when the page changes. Keeping them apart means a re-label cannot silently rewrite the task that produced it.

`cases/A-03.json`:

```json
{
  "id": "A-03",
  "bucket": "A",
  "url": "https://example.com/table",
  "corpus": "corpus/A-03/index.html",
  "task_description": "Collect each country in the table with its population and area.",
  "expected_fields": ["country", "population", "area"],
  "notes": "The header row is a second `<tr>` inside `<thead>`; a naive `tbody tr` read is correct here, but a `table tr` read is off by two.",
  "verified_on": "2026-09-10"
}
```

`ground-truth/A-03.json`:

```json
{
  "case_id": "A-03",
  "bucket": "A",
  "expected_fields": ["country", "population", "area"],
  "item_count_range": [24, 28],
  "sample": [
    { "country": "China", "population": "1,411,000,000", "area": "9,596,961" }
  ],
  "verified_on": "2026-09-10",
  "labelled_by": "agent",
  "source": "snapshot",
  "amendments": []
}
```

Rules:

- `id` is `<bucket>-<NN>`, stable forever. Never reuse an id.
- `task_description` is written the way a user would actually type it. Do not phrase it as a selector hint — that would test your prompt engineering instead of Juxbly. No `.class`, no `#id`, no `querySelector`.
- `expected_fields` are the field names a good tool should produce. The ground truth repeats them: the two must agree.
- `item_count_range` is a **range, never a fixed count**. Pages change; a fixed count manufactures false `wrong` labels.
- `ground_truth.sample` holds **a few representative items**, not the whole page. Enough to judge correctness, small enough to review. Every declared field must carry a non-empty value in every sample item.
- `notes` capture the failure mode you expect: bucket-specific traps, why the site was chosen, anything fragile. If a field cannot be produced as a value on this page (an icon-only column, for example), say so here — otherwise a tool that correctly skips it looks wrong.
- `labelled_by` and `source` record who read the values and from where (`snapshot` or `live`).
- `amendments` is the change log. Ground truth is the baseline every later regression compares against, so every edit is recorded — never made to move a number.

Run `node scripts/check-cases.mjs` before opening a pull request. It enforces all of the above and is wired into `pnpm test`.

## Judgement

Each run is labelled by a human:

| Label | Meaning |
|---|---|
| `correct` | the tool produces the expected fields with correct values |
| `partial` | some fields or items are right, some wrong or missing |
| `wrong` | not usable: empty, structurally wrong, or semantically wrong |

Labelling is deliberately human. There is no mechanical pass threshold, and correctness cannot be decided by "did it return rows".

The full criteria — including how to treat a value that is right in shape but wrong in content, and why ties go to `partial` — are in [`docs/benchmark/README.md`](../benchmark/README.md). Record every judgement with `tests/benchmark/reports/judgement-template.md`.

Beyond the label, a case records: latency, token cost where an `llm` step ran, the health result, and — when applicable — the repair result.

## What you may not submit

- Pages behind a login, paywall, or private network.
- Pages whose content is personal data.
- Targets where collection would violate the site's terms; ToS-sensitive targets are reviewed before acceptance.
- Snapshots you do not have the right to redistribute. Prefer pages you can reference by URL, and keep snapshots minimal — store the structure needed to reproduce the task, not a full media archive.

## Adding a case

1. Pick a bucket that is under-covered.
2. Verify the page's defining property in DevTools.
3. Add the case JSON with a fresh id.
4. Run it: `pnpm test:bench -- --case C-03`.
5. Record your own judgement of the result — including the failures. **Failure cases are the most valuable ones.** A benchmark corpus of only easy sites measures nothing.

## Why this matters more than it looks

M0's 45-case run produced 20.0% correct / 37.8% partial / 42.2% wrong. That number is the reason Juxbly is not described as a universal scraper, and the reason highlight confirmation exists. New cases either sharpen that picture or move it — both are contributions.
