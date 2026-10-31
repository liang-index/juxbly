# Books to Scrape — book list

Collects the title, price, stock status and star rating for every book on the listing page.

## Source page

| | |
|---|---|
| URL | `https://books.toscrape.com/` |
| Bucket | `A` (regular) |
| Verified on | 2026-10-30 |
| Built with | the Juxbly build panel, from one request plus one clarification answer |

Books to Scrape is a purpose-built scraping sandbox, which is why this page is safe to ship
as a public recipe: no login, no personal data, no redistribution question.

## A healthy run

**20 rows, all four columns filled.** Verified by reading the rendered table out of the page:

| Column | Sample value |
|---|---|
| `title` | `A Light in the Attic` |
| `price` | `£51.77` |
| `stock` | `In stock` |
| `rating` | `star-rating Three` |

## Why this recipe uses `attr`

This page is the reason the `attr` field type exists, and the reason worth knowing about:

- The star rating has **no text node** at all — it is encoded as a CSS class,
  `<p class="star-rating Three">`. Read as `text`, `rating` came back empty on all 20 rows.
- The visible anchor text is **truncated** (`A Light in the ...`); the full title sits in the
  `title` attribute.

Both are read here with `field_types` / `field_attrs`:

```json
"field_types": { "rating": "attr", "title": "attr" },
"field_attrs": { "rating": "class", "title": "title" }
```

See [`../../../tests/benchmark/reports/dogfood-2026-10-30.md`](../../../tests/benchmark/reports/dogfood-2026-10-30.md)
for the before/after evidence.

**Known imperfection, stated rather than hidden:** `rating` returns the whole class attribute
(`star-rating Three`), not `Three`. Trimming that needs a per-field transform, which the DSL
does not have yet. The column is populated, which it previously was not, but it is verbose.

## Why it is also a benchmark case

This page is corpus case `A-01`, asking for these same fields. Note that the recipe's values do
not change case `A-01`'s score: `matches` already credited the truncated title, and still does
not credit `star-rating Three` against an expected `Three`. Two things can both be true — this
recipe is better for a user and neutral to the metric — and the report says so rather than
picking the flattering one.

## Desensitisation

No credential, no account identifier, no extracted content: `health_baseline` describes the
*shape* of a healthy result only. `provenance.author` is a public GitHub handle.

## Known fragility

`product_pod`, `price_color`, `instock` and `star-rating` are hand-written class names, not
hashed build output — a stable page by design. Note that `rating` depends on the class order
staying `star-rating <value>`; if the sandbox restyles, that column degrades before the others.
