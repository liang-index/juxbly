# Web Scraper test site — first table rows

Pulls every row out of the **first** table on the page: the row number, first name, last name
and username.

## Source page

| | |
|---|---|
| URL | `https://webscraper.io/test-sites/tables` |
| Bucket | `A` (regular) |
| Verified on | 2026-10-30 |
| Built with | the Juxbly build panel, from one natural-language request, no hand editing |
| Cost of the pass | not recorded — this ran before the harness captured it; every pass since does (see below) |

Web Scraper's `/test-sites` pages exist to be scraped, which is what makes this safe to publish
as a public recipe: no login, no personal data, no redistribution question.

## How it was built and verified

Built by opening the floating ball, typing one request, and confirming the proposal — the
model asked no clarifying question on this pass. Every step was something a person clicked,
and the page was the live site, not a snapshot.

The result was read out of the rendered table:

| Check | Result |
|---|---|
| Item count | 3 rows — the whole of the first table |
| `row_number` | `1`, `2`, `3` |
| `first_name` | `Mark`, `Jacob`, `Larry` |
| `last_name` | `Otto`, `Thornton`, `the Bird` |
| `username` | `@mdo`, `@fat`, `@twitter` |

Those twelve values are the whole result, and all twelve are identical to the ground truth of
corpus case `A-03` — this pass agreed with the labelled answer exactly, field for field.

A healthy run therefore reads **3 rows with all four columns filled**.

## Why it is also a benchmark case

This page is case `A-03` in the Phase 2 corpus, asking for exactly these four fields. So the
recipe and the corpus case measure the same thing, and a regression that touches `A-03` would
show up here too.

## Desensitisation

Nothing in this recipe carries a credential, an account identifier or extracted page content:
`health_baseline` states the *shape* of a healthy result (how many items, what kind of value
per field), never a value. The rows printed in this README are Bootstrap's own demo data,
shown to make the expected result checkable — they are not in `recipe.json`.

## Known fragility

`table:nth-of-type(1)` is positional, and that is the whole point of the page: it offers three
tables, and case `A-03`'s notes record that picking the wrong one is the labelled failure mode
for this task. Adding a fourth table above this one would silently change what the tool reads
rather than failing. The item count is the tell — anything other than three rows here means the
page changed, not that the run was unlucky.

**One thing a second attempt found, which the recipe itself cannot fix.** Three later attempts
to reproduce this build on the same URL did not get past the floating ball: the site's own
cookie-consent banner (Termly) covers it and intercepts the click, so nothing happened for 30 seconds and the drive gave up. That is a real page-level obstruction, not a harness bug — a
person hitting the same wall would have to deal with the banner first. The single clean result
above is still what this page produced, and it is recorded with everything needed to check it
(`tests/benchmark/reports/dogfood-2026-10-30-second-pass.md`).
