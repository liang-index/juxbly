# Scrape This Site — country cards

Collects every country card on the simple-pages sandbox: its name, capital, population and
area.

## Source page

| | |
|---|---|
| URL | `https://www.scrapethissite.com/pages/simple/` |
| Bucket | `A` (regular) |
| Verified on | 2026-10-30 |
| Built with | the Juxbly build panel, from one natural-language request, no hand editing |
| Cost of the pass | 3,822 tokens during the build; the tool has no `llm` step, so a run itself is free |

Scrape This Site is a purpose-built scraping sandbox (its whole point is "here are 250 rows,
go and extract them"), which is what makes this safe to publish as a public recipe: no login,
no personal data, no redistribution question.

## How it was built and verified

Built by opening the floating ball, typing *"List every country on this page by name"*, and
confirming the proposal — no clarifying question was asked. The build proposed **four** fields
for a one-field request; see the note on that below, because it is the part worth reading.

The result was read out of the rendered table:

| Check | Result |
|---|---|
| Item count | 250 rows — the whole page, inside case `A-13`'s labelled range `[240, 260]` |
| `name` | populated on every row (`Andorra`, `United Arab Emirates`, `Afghanistan`, …) |
| `capital` | populated on every row (`Andorra la Vella`, `Abu Dhabi`, `Kabul`, …) |
| `population` | populated on every row (`84000`, `4975593`, `29121286`, …) |
| `area` | populated on every row (`468.0`, `82880.0`, `647500.0`, …) |

A healthy run therefore reads **250-ish rows with all four columns filled**. Zero rows is the
failure mode to react to: a redesign breaks this loudly, not quietly.

### The build over-collected, and that is recorded rather than trimmed away

The request asked for one field — the country's name. The build returned name, capital,
population and area. One of two things could be done with that:

1. Trim the definition down to `name` here, by hand, so the recipe matches the request.
2. Publish what actually ran and say plainly that it answers more than was asked.

This recipe does the second. Editing a tool after the fact and still claiming it was
*verified* would mean shipping a definition nobody has run, which is the same category of lie
as a number nobody measured. Field-level scoring already penalises unrequested columns, which
is exactly why the observation belongs here in words too: a user asking for a list of country
names gets a spreadsheet. Curating this into a one-column preset seed is a later, deliberate
act — and it has to be re-run afterwards to be honest.

## Why it is also a benchmark case

This page is case `A-13` in the Phase 2 corpus, one of the six single-field cases added
2026-09-20. So the recipe and the corpus case measure the same page, and a regression that
touches `A-13` would show up here too.

## Desensitisation

Nothing in this recipe carries a credential, an account identifier or extracted page content:
`health_baseline` states the *shape* of a healthy result (how many items, what kind of value
per field), never a value. The handful of values printed in this README are the sandbox's own
public fixture data; none of them are inside `recipe.json`.

## Known fragility

`span.country-area`, `span.country-capital` and `h3.country-name` are author-written class
names on a page built to be stable. `div.col-md-4` is a Bootstrap grid column, and it is wider
than the content: on this page every column is a country card, but a page that reused the grid
for navigation would pull unwanted rows in — the item count would jump well past 260, which is
what makes this break loudly.
