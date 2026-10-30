# Six single-field cases join the corpus, and the baseline moves with them (2026-09-20)

The 2026-09-19 report ended by retracting the "field-count cliff" and with it the product
recommendation that had been built on it, and said the recommendation needed re-deriving
before it reached a roadmap. It could not be re-derived from the data that existed: seven
single-field cases out of fifty is one cell of a table that no reading can support. This
report is the re-derivation, on a corpus that can carry it.

## What changed

Six single-field cases were added, two `A`, one `C`, one `D` and two `E` — the buckets that
had none or few:

| Case | Source | Task (single field) | Rights basis |
|---|---|---|---|
| `A-13` | scrapethissite.com/pages/simple | country name (250 `.country` cards) | scraping-sandbox |
| `A-14` | postgresql.org docs, string functions | function name (57 across several tables) | oss-docs |
| `C-11` | shoelace.style badge | badge label (23 hosts, text inside shadow roots) | oss-docs |
| `D-09` | mastodon.world/explore | post author (50 rows, same shape as `D-03`) | reviewed-tos |
| `E-11` | mui.com alert docs | sidebar component name (75 items) | oss-docs |
| `E-12` | chakra-ui.com checkbox docs | on-page TOC label (25 anchors) | oss-docs |

The corpus is 56 cases. Every bucket sat at or one under its cap, so the caps moved with
the change and the reason is written next to the constant (`BUCKET_RANGE`,
`apps/playground/lib/corpus.mjs`). Health check green: 56/56 snapshots load offline, all
six new pages verified into their bucket by measurement at capture. Ground truth was
audited with the rest of the corpus — clean — and the audit was checked in the failing
direction too: a value no page contains turns `E-12` red.

Two candidates were probed and rejected: material-web.dev timed out at capture, and
`emotion.sh/docs/basics` is a 404.

## The reading

Two control runs of the new corpus, same day, same model, both replayed from the committed
digests with zero drift:

| | Run 1 | Run 2 | **Median** | Spread |
|---|---|---|---|---|
| Build success | 94.6% | 89.3% | **92.0%** | 5.3pp |
| Field-level F1 | 42.7% | 43.4% | **43.1%** | 0.7pp |

Digests: `tests/benchmark/digests/2026-09-20-control-r{1,2}.json`. Both spreads are inside
the 8pp rule, so this is a reading.

**The baseline moved because the corpus moved, not because the engine did.** The engine,
the prompt and the selection rule are exactly what read 38.1% yesterday. The six new cases
are single-field, and single-field is where the configuration is strongest; adding six of
them lifts the corpus-wide number. This is recorded as a new ruler, not as progress —
which is precisely the situation the "re-measure when the corpus revision changes" rule
exists for.

## What the wider single-field cell says

Single field now has 26 case-runs across both readings (13 cases), spread over all five
buckets. Pooled:

| Fields asked for | Case-runs | F1 | Precision | Recall |
|---|---|---|---|---|
| 1 | 26 | 65.4% | 65.4% | 65.4% |
| 2 | 60 | 27.9% | 29.4% | 26.7% |
| 3 | 22 | 49.6% | 49.3% | 50.0% |
| 4 | 4 | 87.5% | 87.5% | 87.5% |

| Bucket | Case-runs | F1 |
|---|---|---|
| A | 28 | 64.7% |
| B | 20 | 21.3% |
| C | 22 | 41.6% |
| D | 18 | 55.9% |
| E | 24 | 18.4% |

Reproduce both tables:
`node scripts/bench-breakdown.mjs tests/benchmark/digests/2026-09-20-control-r{1,2}.json`.

The two slices are still collinear — `E` holds 18 of the 24 two-field case-runs — so the
question "is two-field weakness a bucket artefact" needs the cells, not the margins. Per
cell, over the same pooled readings (cells with at least 6 case-runs):

| Cell | Case-runs | F1 |
|---|---|---|
| D, 1 field | 8 | 88.9% |
| C, 1 field | 6 | 66.7% |
| A, 3 fields | 10 | 62.3% |
| D, 3 fields | 6 | 55.6% |
| A, 2 fields | 10 | 52.6% |
| C, 2 fields | 14 | 30.2% |
| B, 2 fields | 14 | 28.6% |
| E, 2 fields | 18 | 14.7% |

Three things the cells say that the margins cannot:

1. **Single-field holds up where the bucket is hard.** `D` at one field is 88.9% and `C` at
   one field is 66.7% — the two hardest buckets, at one field, beat every multi-field cell
   in the easy buckets. Single-field strength is not the old "one-field cases live in easy
   buckets" artefact.
2. **Two fields is weak everywhere, not only in `E`.** The best two-field cell is `A`, the
   easiest bucket, at 52.6% — thirteen points below `A` at three fields. Within `C`, one
   field is 66.7% and two fields 30.2%.
3. **The bucket still dominates within a field count.** Two fields spans 52.6% in `A` down
   to 14.7% in `E`, a 37.9pp range. Difficulty of the page and number of fields are both
   real; neither is the whole story.

## The product claim, re-derived

The original claim was "the launch preset pack should be single-field only", built on a
cliff that did not exist. The 2026-09-19 report retracted it. The re-derived claim, on
n=13 single-field cases across all five buckets:

**Single-field is the strongest cut the corpus can support, and two-field tasks are the
specific danger zone.** One field reads 65.4% corpus-wide and holds up inside hard buckets;
two fields read 27.9% and are weak even in the easiest bucket. But "only single-field"
overstates what the data says: three-field tasks read 49.6% and the four-field cell (two
cases) read 87.5%, both above two fields. The defensible preset rule is not "one field" —
it is "avoid two-field presets until the two-field failure mode is understood". That is a
product decision and it belongs to the maintainer; what this report contributes is that
the two-field number is now measured on enough cases to be load-bearing, in both directions
(60 case-runs, consistent across buckets).

## Gates

Corpus revision changed, so the baseline was re-set per the rule:

- Build success: ≥ 85%. Reading 92.0% — **met**.
- Field-level F1: ≥ 47% (the 43.1% baseline plus one 4pp noise band). Reading 43.1% —
  **not met**.

A per-bucket gate was considered and rejected at this corpus size: bucket `C` read 36.8%
and 46.2% across the two runs, a 9.4pp spread on eleven cases — wider than the 8pp rule,
so a `C` gate would gate on noise. The bucket split stays descriptive (`docs/ROADMAP.md`)
until buckets are big enough to hold a reading.

## Known issues in this report

- The six new cases were authored by the same process that writes these reports, and task
  selection is a judgement the audit cannot check: the audit proves the ground-truth values
  are on the page, not that the task is fairly worded. They were written the way the
  existing fifty are — task phrased as a user would type it, no selector in the wording —
  but the confirmation is review, not measurement.
- The new cases are not yet labelled (`correct` / `partial` / `wrong`): label counts in the
  reports show them as pending. Field-level F1 does not use the labels, so the numbers here
  are unaffected; the next labelling pass should pick them up.
- `C`'s bucket F1 spread is 9.4pp across the two runs (36.8% / 46.2%), so `C`'s 41.6% is a
  soft number. The per-cell `C` figures inherit that softness.
- The four-field cell is two cases (4 case-runs); its 87.5% is indicative only. `E` at one
  field is four case-runs, below the per-cell cutoff, so "single-field holds in `E`" is
  untested, not established.
- Costs: about $0.11 per 56-case reading on this day (roughly 155k prompt + 11k completion
  tokens per run on `deepseek/deepseek-chat`, median case latency ~7.2 s).
