# Quotes to Scrape — quote digest

Collects the quote text, the author, and the tags for every quote on the front page.

## Source page

| | |
|---|---|
| URL | `https://quotes.toscrape.com/` |
| Bucket | `A` (regular) |
| Verified on | 2026-10-30 |
| Built with | the Juxbly build panel, from one natural-language request, no hand editing |

Quotes to Scrape is a purpose-built scraping sandbox, which is why this page is safe to ship
as a public recipe: no login, no personal data, no redistribution question.

## How it was built and verified

Built by opening the floating ball, typing one request, answering the panel's clarifying
question once, and confirming the proposal. Every step below is something a person clicked.

The result was checked by reading the rendered table out of the page:

| Check | Result |
|---|---|
| Item count | 10 rows — the full front page |
| `text` | populated on every sampled row |
| `author` | populated on every sampled row |
| `tags` | populated on every sampled row |

A healthy run therefore reads **10 rows with all three columns filled**. Anything else is
either a redesign or a regression, not normal variance.

## Why it is also a benchmark case

This page is case `A-02` in the Phase 2 corpus, asking for exactly these three fields. So the
recipe and the corpus case measure the same thing, and a corpus regression that touches `A-02`
would show up here too.

## Desensitisation

Nothing in this recipe carries a credential, an account identifier, or extracted page content:
`health_baseline` states the *shape* of a healthy result (how many items, what kind of value),
never a value. `provenance.author` is a public GitHub handle.

## Known fragility

`div.tags a.tag` and `small.author` are author-written class names, not hashed build output —
this is a stable page by design. If the sandbox is ever restyled, this recipe breaks loudly
(rows drop to zero) rather than quietly returning wrong values.
