# Dogfooding record — second pass, 2026-10-30

The first record ended with two things noted as undone: the harness used to take these
readings lived in `/tmp`, and it captured neither cost nor latency. Both are fixed here, and
three more pages were driven on the live web with a live model. Everything below came out of
the built extension running in a real Chromium against a page on the public internet.

```bash
JX_API_KEY=sk-... pnpm dogfood -- --url <page> --task "<request>"
```

## What changed before the readings were taken

- `scripts/dogfood.mjs` is in the repository (`pnpm dogfood`), reusing the lifecycle
  harness's browser and step helpers so the acceptance path and the dogfooding path drive the
  same surface. Output goes to `.dogfood/<timestamp>-<host>` — screenshots of the proposal and
  the result, the saved tool record, and a `report.json`.
- The report carries **what the pass cost and how long it took**: build tokens read off the
  build chat's own usage line, run tokens off the run panel's own token line, and wall-clock
  timings for page load, proposal and settle. Both are read from what the UI shows a user, so
  the harness and a person watching the same pass cannot disagree. A missing reading is
  `null`, never `0`.

## Reading 1 — `webscraper.io/test-sites/tables` (corpus case `A-03`) — clean, once

Request: *"Pull the rows out of the first table on this page: the row number, first name, last
name and username."*

| Check | Result |
|---|---|
| Rows | 3 — exactly `A-03`'s range `[3, 3]` |
| Fields | `row_number`, `first_name`, `last_name`, `username` — all four asked for, none extra |
| Values | identical to the ground-truth sample, all twelve of them (`1 / Mark / Otto / @mdo`, …) |
| Highlights | 12 in 2,100 ms |
| Cost | **not captured** — this ran before the harness recorded it |

A first-try, no-clarification-asked result agreeing with the labelled answer field for field.
It became [`docs/recipes/webscraperio-first-table/`](../../../docs/recipes/webscraperio-first-table/README.md).

**Three later attempts to repeat it did not get past the floating ball.** The site serves a
cookie-consent banner (Termly) that covers it and intercepts the click; the drive waited 30
seconds and gave up (once earlier the whole target closed mid-run). That is a page-level
obstruction, not a harness bug — a person meets the same wall and has to deal with the banner
first — and it is recorded rather than worked around, because making a dogfooding harness
click through someone's cookie choice on their behalf is not something this project should do
quietly. Worth deciding separately whether a UI element the product owns should be reachable
below a consent overlay it does not own.

## Reading 2 — `scrapethissite.com/pages/simple/` (corpus case `A-13`) — right rows, four fields for one

Request: *"List every country on this page by name."*

| Check | Result |
|---|---|
| Rows | 250 — inside `A-13`'s range `[240, 260]`, and all 250 filled |
| Fields asked for | 1 (`name`) |
| Fields returned | 4 (`area`, `capital`, `name`, `population`) |
| Highlights | 24 in 1,680 ms |
| Cost | 3,822 tokens in the build; the tool has no `llm` step, so running it is free |

Every field it produced was correct — that part is not in question. What it produced was not
what was asked for: a user who says "list the country names" gets a four-column spreadsheet.
Three unrequested columns cost precision, and field-level scoring already counts them against
the number, so this is the same loss seen at 43.1% F1 showing up in front of a person. The
recipe publishes the tool **as it actually ran** rather than trimming the definition after the
fact; editing a tool and still calling it verified would ship a definition nobody has run.

**Re-run the same evening, after the harness was refactored:** 250 rows again, the same four
columns, 3,830 tokens against the first pass's 3,822. One run of one configuration is not a
reading in this project (two runs, take the median), but 250/250 twice is at least evidence
that a result on this page reproduces — and the over-collection came back both times, so it is
a habit of the build rather than a roll of the dice.

## Reading 3 — `quotes.toscrape.com/scroll` (corpus case `D-01`) — one screen deep

Request: *"Collect every quote on this page with its author and tags."*

| Check | Result |
|---|---|
| Rows returned | **10** |
| Rows `D-01` expects | **60–80** (the snapshot holds 70) |
| Fields | `quote`, `author`, `tags` — correct values, on the rows it read |
| Highlights | 18 in 1,561 ms |
| Cost | 1,794 tokens in the build; no `llm` step, so no run cost |

This is the same request that reads correctly on `quotes.toscrape.com` (case `A-02`, 10/10
rows, three of three fields). On the infinite-scroll sibling it read exactly one screenful,
because the definition the model proposed contains no `pre_scroll`:

```json
{ "type": "extract", "selector": "div.quote", "mode": "list", "fields": { … } }
```

The DSL has had `pre_scroll` since stage 1-5 and the extract capability implements it (to
bottom, capped at 10 rounds, stopping as soon as the page stops growing). The chain breaks at
the prompt:

- `analyzePage` **detects** the hint — `detectScrollHint`, `packages/analyzer/src/structure.ts`;
- `page-view.ts` **sends** it to the model — `scrollHint` is in the data section the build
  prompt wraps;
- nothing anywhere in `packages/llm` **names `pre_scroll`** as the thing to write when that
  hint says lazy. `pre_scroll` appears nowhere in the LLM package.

So the model is told the page is lazy and given no way to say anything about it. Every `D`
page is read one screen deep for that reason, and bucket `D` is one of the two shapes the
launch copy promises (Maintainer ruling 2026-09-22). Recorded, not fixed: teaching the prompt
a capability that already exists sits inside the cheap prompt-side experiment series that is
closed, and the reason it is closed still holds — it has never moved field F1 outside the
noise band.

## What none of this does

**It does not move either gate.** Nothing here changes Build Success Rate (92.0%, met) or
field-level F1 (43.1%, needing 47%). These are three more pages of a maintainer using the
product, which is what phase 3-1 is for, and two of the three findings above are about a user
experience that no corpus number reports: an unreachable ball under a consent banner, and a
"list the names" request answered with a spreadsheet.

The `D` finding is the one with a number attached to it that reads badly — 10 rows where 60–80
are expected — and it should not be read as "the second gate got further away". That case was
already scoring what it scores; nothing regressed today. It says something different: the two
shapes being promised are `A` and `D`, and on `D` the product currently returns the first
screen and stops.

## Where the evidence is

| Pass | Artefact |
|---|---|
| `A-03` | `.dogfood/2026-10-30T232450-webscraper.io/` (and the three failed retries after it) |
| `A-13` | `.dogfood/2026-10-30T232602-scrapethissite.com/` |
| `D-01` | `.dogfood/2026-10-30T232612-quotes.toscrape.com/` |
| Recipes | `docs/recipes/webscraperio-first-table/`, `docs/recipes/scrapethissite-countries/` |

`.dogfood/` is gitignored on purpose — it holds live page content, including screenshots of
result tables. What survives into the repository is what a person wrote afterwards: this
record, and the two recipes it produced.
