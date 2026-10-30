# Step 4: two engine-side experiments, both negative (2026-09-19)

Two changes were tried because the prompt-side lever was already known to be spent: across
five runs of the same corpus, field-level F1 lands in 35.9% - 38.8%, inside the noise band,
so no prompt rule has moved what comes out. The two ideas left were **change what the model
is shown** and **let the page pick between the candidates**.

Both lost. This report is the record of that, and of the measurement that says the diagnosis
behind them was wrong.

## What was run

50 cases, `deepseek/deepseek-chat`, corpus revision `2026-09-10T16:28:04.724Z`, all on
2026-09-19. Every number below is a replay of a committed digest
(`tests/benchmark/digests/2026-09-19-*`), so it can be re-checked with no key and no spend.
The two slice tables — by fields asked for, and by bucket — are recomputed from those same
digests by `scripts/bench-breakdown.mjs`; the exact command is quoted with them.

| Variant | What changes |
|---|---|
| `control` | the shipped prompt and the shipped rule: run the first candidate that passes validation |
| `bestof` | same prompt; the benchmark applies the product's own candidate ranking (`evaluateCandidates` / `pickBestCandidate`, `docs/ARCHITECTURE.md` 5.6) instead of taking the first |
| `flat` | the page is described as a numbered list and a selector is written as a reference into it (`@3`) instead of as CSS |

`flat` was run once; `control` and `bestof` twice, so their medians are the readings.

## Results

| Variant | Reading | Build success | Field F1 | Precision | Recall | Item count in range | Container from list | Fields from list |
|---|---|---|---|---|---|---|---|---|
| `control` | 1 | 86.0% | 37.4% | 40.0% | 35.2% | 28.0% | 42/46 | 67/101 |
| `control` | 2 | 94.0% | 38.7% | 39.4% | 38.0% | 30.0% | 40/48 | 63/106 |
| **`control` (median)** | | **90.0%** | **38.1%** | | | | 82/94 (87%) | 130/207 (63%) |
| `bestof` | 1 | 86.0% | 31.5% | 33.7% | 29.6% | 28.0% | 39/44 | 57/97 |
| `bestof` | 2 | 86.0% | 36.3% | 38.5% | 34.3% | 30.0% | 37/45 | 58/101 |
| **`bestof` (median)** | | **86.0%** | **33.9%** | | | | 76/89 (85%) | 115/198 (58%) |
| `flat` | 1 | 76.0% | 30.6% | 34.1% | 27.8% | 28.0% | 39/44 | 77/101 |

Spread across the two readings: `control` 1.3pp on F1 and 8.0pp on build success; `bestof`
4.8pp on F1. Build success moved more than F1 did, which is itself a finding — build success
is the noisier of the two numbers, and the one the roadmap used to gate on alone.

The medians are the arithmetic median of the two readings (`medianOf`, `apps/playground/src/bench/metrics.ts`):
38.1% is `(37.4 + 38.7) / 2`. That definition is the load-bearing half of "the median of two
runs", and it was not the one the CLI printed until this run — its `variance()` took the upper
of the two sorted readings, which is the better one, which is the direction
`docs/benchmark/README.md` forbids. Both readings are under the 42% gate, so no verdict in
this report changes; the number a reader re-derives does.

Against the 42% entry threshold (the 38.0% baseline plus one 4pp noise band): `control` reads
38.1%, so the gate is still not met, and neither variant closes any of the gap.

## What this says

**1. The diagnosis was wrong.** The premise for both experiments was "the model does not read
the container list we hand it". It does: 87% of container selectors in the control readings are
selectors the analyser offered (`B-04`'s hand-written `div>div>a` was the exception that got
remembered, not the rule). The weaker number is the fields — 63% of field selectors were
offered ones.

**2. `flat` moved the mechanism and still lost.** Indexed selection raised "fields taken from
the list" from 63% to 76% — the change did what it was designed to do — and F1 fell 7.5pp and
build success fell 14pp. Choosing more often from the list is not the lever; something about
what comes back from those choices is. That flat cost build success as well suggests the
reference syntax (`@3`) itself broke a subset of proposals.

**3. `bestof` is not a gain, and it is the product's own rule.** Ranking candidates by a dry
run read 4.2pp below taking the first one, with its own spread at 4.8pp — so the honest
reading is "not better, possibly slightly worse, and not separable from noise at two runs".
It is not adopted here. It is worth noting that this ranking is what the panel shows a user
(`ARCHITECTURE.md` 5.6), so the question it raises is about the product and not only about the
benchmark. A candidate that scores well is one that matched a lot of nodes and filled its
fields; on a corpus where the task often asks for a *subset* of the page, matching more is not
better.

**4. Three prompt- or proposal-side changes have now produced no measurable gain** — the
`hitCount` rule (2026-09-19, earlier), `bestof`, and `flat`. The search has been in the wrong
place for a while, and the measurement is what says so.

## A carried claim that does not survive this data

The "field-count cliff" — one field 57%, two fields 0% — came from `correct` labels over a
single run, with seven single-field cases. Scored by F1 over both control readings (100
case-runs), with the bucket table and the cross-tab from the same command:

```bash
node scripts/bench-breakdown.mjs \
  tests/benchmark/digests/2026-09-19-control-r1.json \
  tests/benchmark/digests/2026-09-19-control-r2.json
```

| Fields asked for | Case-runs | F1 | Precision | Recall |
|---|---|---|---|---|
| 1 | 14 | 50.0% | 60.0% | 42.9% |
| 2 | 60 | 27.7% | 28.8% | 26.7% |
| 3 | 22 | 48.1% | 49.2% | 47.0% |
| 4 | 4 | 64.5% | 66.7% | 62.5% |

| Bucket | Case-runs | F1 | Precision | Recall |
|---|---|---|---|---|
| A | 24 | 58.7% | 61.7% | 56.1% |
| B | 20 | 24.7% | 25.7% | 23.7% |
| C | 20 | 27.8% | 29.4% | 26.3% |
| D | 16 | 56.7% | 60.7% | 53.1% |
| E | 20 | 14.3% | 14.3% | 14.3% |

The two slices are not independent, and the cross-tab is what shows it — a reader cannot argue
"fields" from the first table alone:

| Bucket | 1 field | 2 fields | 3 fields | 4 fields |
|---|---|---|---|---|
| A | 0 | 10 | 10 | 4 |
| B | 4 | 14 | 2 | 0 |
| C | 4 | 14 | 2 | 0 |
| D | 6 | 4 | 6 | 0 |
| E | 0 | 18 | 2 | 0 |

Two-field cases are the weakest, but three- and four-field cases score *better* than two-field
ones, so "more fields is worse" is not what the data says. What the cross-tab says is that the
field count is nearly collinear with the bucket: `E`, the worst bucket at 14.3%, is 18/20
two-field, and the 14 single-field case-runs are not spread across the corpus but concentrated
in `B`, `C` and `D`. So the flat-looking "1 field scores 50%" is mostly "one-field cases live in
`B`/`C`/`D`, and `D` is easy". The practical recommendation that came out of the old cliff
("the launch preset pack should be single-field only") is therefore **not supported as stated**
and needs re-deriving before it reaches a roadmap or store copy.

## Known issues in this report

- The slice tables in the last section were first computed in a scratch file that was then
  deleted, which is a published number nobody can check — the thing this report's opening
  paragraph promises not to do. They are now recomputed from the digests by
  `scripts/bench-breakdown.mjs`, which is committed. Re-running it reproduced every cell in
  both tables unchanged; the numbers were not adjusted to fit the script.
- `flat` has one reading, not two. Its gap to control (-7.5pp F1) is larger than the noise
  band, and control's own F1 spread today was 1.3pp, so the direction is likely real; the size
  is not.
- `control`'s build success spread was 8.0pp across two readings — at the edge of the "this is
  not a reading" rule in `docs/benchmark/README.md`. The build-success medians here should be
  treated as soft; the F1 medians are the ones this report argues from.
- The runs were taken as five bucket-sized slices each (12/10/10/8/10 cases) and merged,
  because a single 50-case invocation does not survive to completion in this environment. Every
  slice is a full run of its cases; the merge is only of digests.
- Costs: about $0.09 per 50-case reading on this day, against about $0.05 earlier in the week —
  the endpoint was slower, not the corpus larger.
