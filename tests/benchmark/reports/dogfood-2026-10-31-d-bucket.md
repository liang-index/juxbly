# Dogfooding record — 2026-10-31, the D bucket

Stage 3-2 set out to grow the launch preset pack toward its ~10-preset goal from the D
bucket (lazy-loaded lists) — the page shape the launch promises alongside `A`
(Maintainer ruling 2026-09-22). Six corpus cases were taken to their **live** pages,
one request per pass, through the built extension in Chromium. This record is the
result, and the result is a verdict the pack's own rule (quality gate over count)
makes honest to publish:

**Zero of the six candidates produced a tool worth packing. The pack stays at four.**

Nothing here is a lab number. Every row below was produced by the built extension
running against a page on the public internet, through the real UI.

## How it ran

| | |
|---|---|
| Build | `.output/chrome-mv3`, manifest v3 (open-source build), rebuilt 2026-10-31 |
| Model | `deepseek-chat` over the BYOK channel, live key, not a recording |
| Driving | `node scripts/dogfood.mjs` — clicks and typing only; one `--answer` for clarifications, as a person would answer |
| Cases | `D-01 D-02 D-03 D-06 D-07 D-08` — `D-04/05/09` are the same Mastodon explore page as `D-03`, so one instance stands for the four |
| Cost | ~20k build tokens across 15 runs (14 harness passes + 1 diagnostic probe) |

## The pass log

| Case | Page | Passes | Best live result | Outcome |
|---|---|---|---|---|
| D-01 | `quotes.toscrape.com/scroll` | 3 | 10 rows, all three fields populated | blocked — the build cannot express scrolling |
| D-08 | `scrapethissite.com/pages/ajax-javascript/` | 3 | 1 empty row | blocked — V1 cannot click; the right selectors, matched against nothing |
| D-02 | `dev.to/` | 3 | 19 rows; headline + link populated | partial — `tags` empty on every row, health still `healthy` |
| D-06 | `react.dev/learn` | 2 | no proposal | blocked — stall, cause not captured |
| D-03 | `mastodon.social/explore` | 1 | 0 rows | blocked — the analyzer described only the extension's own UI |
| D-07 | `ant.design/docs/react/introduce` | 2 | 50 rows of the wrong list | partial — ambiguous answer sent it to the site sidebar; retry stalled |

Per-pass readings (proposal wall-clock / build tokens, as the UI showed them):
quotes 2 046 ms / 1 788 and 2 546 ms / 2 339; scrapethissite 21 786 ms / 2 342;
dev.to >120 s, >120 s, then 2 055 ms / 3 893 (probe: ~100 s, 3 973); mastodon
4 077 ms / 2 069; ant.design 3 588 ms / 3 539.

## What the passes found

### 1. The build prompt never names `pre_scroll`, so no live build can propose it

The DSL has the field (`§5.2`), the validator accepts it, the extract capability
implements it (capped, abort-aware), and the corpus has an infinite-scroll fixture
for it. The one place that cannot say so is the build prompt: the `ToolDefinition`
schema in `buildInstruction` (`packages/llm/src/build-propose.ts`) lists an extract
step's fields without `pre_scroll` — and adds "No control flow… Steps run in order,
once", which argues against the very idea.

Three passes on `quotes.toscrape.com/scroll` returned the same first-screen tool:
two proposals, 10 rows each (of 70), one with the scroll instruction spelled out in
the request ("Keep scrolling to the bottom until no new quotes appear"). The model
cannot propose what the schema never names, and it did not invent the field name.

The benchmark cannot see this gap: it replays the loaded snapshot, where all 70
quotes are already in the DOM and no scroll is ever needed. D-01 builds and scores
there without the field existing. This is finding one of the live-vs-snapshot gap,
and it has a one-line fix (schema + rule) that changes every build — recorded, not
rushed into this segment.

*Postscript, same day: the fix landed after this record was written, and the live
re-verification found a second bug behind the first. The prompt fix alone put the
D bucket at 9/9 on the corpus (from 7/9), `pre_scroll` proposed on the four cases
whose pages carry a scroll hint — but the live quotes/scroll pass still stopped
at 10 rows: the run port's growth check re-read `scrollHeight` one macrotask
after the scroll, which is earlier than any real network fetch completes, so the
first round saw "no growth" and stopped. The corpus fixture grows synchronously
and never shows this — the same live-vs-snapshot gap that hid finding 1 hid this
one. With the growth check given a settle budget, and the prompt teaching `max`
for feeds that page through many batches, the same live page now extracts **100
rows** — the site's real total (the corpus case says 70; the snapshot predates
the site's growth, which is its own small honest note). Finding 1 is closed end
to end: found live, fixed in the prompt, measured on the corpus, verified live.*

### 2. The benchmark's D readings do not transfer to live pages

The D bucket's corpus reading is 55.9% build success. Live, 0 of 6 candidates
produced a usable tool. The reasons are exactly what a frozen snapshot freezes away:

- **D-08**: the table exists only after a year is clicked; the snapshot *is* the
  after-click state, the live page is not, and V1 has no click capability. The
  proposal named the classes the real table uses (`table tr` with `.title`,
  `.nominations`, `.awards`) — matched against a page where they exist only in a
  table body no one has filled. One empty row.
- **D-03**: the live trending feed is a virtualized list; see finding 4.
- **D-02**: the corpus note — "the tag list sits outside the headline element" —
  materialized: `tags` read empty on all 19 rows while headline and link populated.

### 3. Proposal latency is wildly variable, and the harness's patience was part of the measurement

dev.to produced no proposal inside the harness's fixed 120 s budget on two passes —
no clarification, no error the harness could see. A diagnostic probe (same flow,
polling the chat stream every 5 s) watched the same page and task produce a proposal
in under ~100 s. The third full pass proposed in 2.1 s. Same page, same request:
>120 s, >120 s, 2.1 s. react.dev stalled at 300 s once — one reading, not a verdict.

A person keeps watching the streaming panel; the harness was ending passes first.
`JX_PROPOSAL_BUDGET_MS` now overrides the budget (default 120 s unchanged). The
product-side conclusion is *not* drawn here: whether 120 s of silence with only a
"Working on it…" line is acceptable UX is a §7 question this record only feeds.

### 4. On mastodon.social/explore the analyzer's page view is the extension's own UI

The model's clarification, quoted from the pass: *"The page data shows only the
browser-tool UI (no post list markup), so I can't see the feed's container/author
selectors."* The floating ball's markup lives in the same DOM the analyzer reads, and
on a page whose real content is virtualized it was the only thing left to describe.
Two facts in one finding: virtualized feeds are invisible to V1 analysis (the known
ceiling the corpus caveat predicted), and the analyzer does not exclude its own root
— a hygiene fix, unlike the first.

### 5. An entirely empty column does not change a tool's health

D-02's saved tool reads `health.status: "healthy"` with `field_digest.tags: "empty"`
and `field_presence.tags: 0` across 19 rows. Health measures structure — rows found,
fields read — so a column that found *nothing at all* still passes. For the user this
is the worst failure shape: a table that looks complete and is not. Recorded as a
product question for the health spec, not fixed here.

### 6. An ambiguous answer steers the build as strongly as a good one

D-07's clarification ("sidebar nav links or the floating outline?") was answered
"Yes." — the harness's stand-in for a person not reading carefully. The proposal
obliged with the site-wide sidebar: 50 rows of every nav link on ant.design, via a
generic `div > ul > li`, plus 8 entirely empty rows. A retry with the answer spelled
out stalled past 300 s. The clarification surface works; the harness's one-size
answer is a harness limit, worth remembering when reading any pass log.

## What did not land

No recipes, no pack change: `docs/recipes/` stays at four directories and
`tests/unit/presets.test.ts` passes unchanged. A recipe needs a verified live run and
an honest health baseline; none of these passes produced both. D-01's 10-row tool is
real and correct on its own terms — it is also, field for field, the tool the existing
`quotes-toscrape-quotes` front-page recipe already packs, minus the point of the page
it was built on.

## Reproducing

```bash
pnpm build
JX_API_KEY=sk-... JX_PROPOSAL_BUDGET_MS=300000 pnpm dogfood \
  --url https://quotes.toscrape.com/scroll \
  --task "Collect every quote on this page with its author and tags."
```

Raw pass artefacts (screenshots, saved tools, reports) are gitignored under `.dogfood/`;
the numbers above are what the harness printed and what the rendered tables showed.
