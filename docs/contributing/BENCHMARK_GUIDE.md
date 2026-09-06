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

Cases live in `tests/benchmark/cases/` as JSON:

```json
{
  "id": "C-03",
  "bucket": "C",
  "url": "https://www.reddit.com/r/webdev/",
  "task_description": "Collect the title, subreddit, and score of each post in the feed.",
  "expected_fields": ["title", "subreddit", "score"],
  "ground_truth": {
    "item_count_range": [10, 30],
    "sample": [{ "title": "...", "subreddit": "r/webdev", "score": "142" }]
  },
  "notes": "Feed is rendered inside shreddit-* custom elements with open shadow roots.",
  "verified_on": "2026-01-01"
}
```

Rules:

- `id` is `<bucket>-<NN>`, stable forever. Never reuse an id.
- `task_description` is written the way a user would actually type it. Do not phrase it as a selector hint — that would test your prompt engineering instead of Juxbly.
- `expected_fields` are the field names a good tool should produce.
- `ground_truth.sample` holds **a few representative items**, not the whole page. Enough to judge correctness, small enough to review.
- `notes` capture the failure mode you expect: bucket-specific traps, why the site was chosen, anything fragile.

## Judgement

Each run is labelled by a human:

| Label | Meaning |
|---|---|
| `correct` | the tool produces the expected fields with correct values |
| `partial` | some fields or items are right, some wrong or missing |
| `wrong` | not usable: empty, structurally wrong, or semantically wrong |

Labelling is deliberately human. There is no mechanical pass threshold, and correctness cannot be decided by "did it return rows".

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
