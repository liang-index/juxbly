# Attribution - 2026-09-19

Follow-up to `attribution-2026-09-17.md`. Three full 50-case runs, all on the same machine,
with the same model (`deepseek/deepseek-chat`) and the same corpus. The point of running them
together is that the 2026-09-17 numbers were taken on two different days and cannot be
compared with each other - these three can.

| Run | Prompt | Build success | Count accuracy | correct / partial / wrong |
|---|---|---|---|---|
| `2026-09-19T09-29-16` | **reverted to the pre-2-4 prompt** (`31c185e~1`) | **80.0%** | 24% | 4 / 24 / 22 |
| `2026-09-19T09-16-01` | current + a `hitCount` rule | 88.0% | 28% | 4 / 27 / 19 |
| `2026-09-17T23-37-02` | current | 90.0% | 28% | 5 / 30 / 15 |

Build success is `generationSucceeded && itemCount > 0`. Count accuracy is the share of cases
whose item count falls inside the ground-truth range.

## 1. The recorded 72% baseline does not reproduce

The pre-2-4 prompt was restored from `31c185e~1` - the diff against today's prompt is exactly
two rules (`url_pattern` and `:self`), nothing else - and run today. It produced **80.0%**,
not the 72.0% recorded for it on 2026-09-17.

So "72 -> 90, prompt work bought 18pp" is not a claim the data supports. Part of that gap is
engine-side change (`:self` support in the DSL and the validator, the corpus-host fix) and
part is day-to-day model variance. The gain that survives a same-day comparison is:

- build success **80 -> 88/90** (+8 to +10pp)
- count accuracy **24% -> 28%** (+4pp)
- correct **4 -> 5** (+1 case)

**This correction also lands in `docs/PRODUCT.md` §4.5.**

## 2. Single-variable experiment: make the model trust `hitCount` - null result

Hypothesis: the dominant failure class is `wrong-element` (24 of 45 non-correct cases, 48%):
the model selects a container that matches far more or far fewer elements than the thing the
user asked for. The analyse step already hands the model a `hitCount` per container
(`summarizeAnalysis`), so the rule added was: *the container's hitCount is exactly how many
items the tool will produce; pick the container whose hitCount matches the repeated thing the
user asked for.*

Result: **nothing moved on the metric it was aimed at.** Count accuracy was 28% before and
28% after - 14 of 50 cases in range in both runs. Build success 90 -> 88, wrong 15 -> 19. All
of that is inside the ±4pp noise band established by running one configuration twice on
2026-09-17 (86% and 90%), so the honest reading is *no effect*, not *a small regression*.

The rule was reverted. It is not in the tree.

Why it did nothing - one case measured: `B-04` expects 70-85 items. The model emitted
`div>div>a`, which matches **232**. The corpus metadata records the page's largest repeating
group as **168**. So the model did not pick one of the containers it was offered; it wrote a
generic selector that matches more than any analysed repeating group. A rule that says "use
the hitCount of the container you pick" cannot help a model that is not picking from the list.

**Not yet generalised.** Confirming that the model ignores the offered container list across
all cases needs the analyser run over every snapshot; only `B-04` was measured here.

## 3. What that means for the next lever

Two prompt rules have now been tried against this corpus: `url_pattern` (measured +8pp
cross-day, not reproduced same-day) and `hitCount` (null). A third, `selector-form`, was
tried on 2026-09-17 and regressed. The remaining lever is **engine-side**: rank and narrow the
candidate containers before they reach the model, so the container list in the data section is
short enough that picking from it is the path of least resistance.

## 4. Where correctness actually sits (from `2026-09-17T23-37-02`, n = 50)

- **Build success 90%, correct 10%.** The two are decoupled; reporting build success alone
  overstates the product.
- **Count is a necessary condition.** Every one of the 5 correct cases had a count inside the
  expected range; none of the 36 out-of-range cases was correct. Count right -> 36% correct.
- **The field-count cliff.** 1 field: 57% correct (4/7). 2 fields: **0% correct (0/30)**.
  3 fields: 9%. 4 fields: 0%. Two-field cases are 60% of the corpus.
- **Bucket inversion.** The easiest bucket, A (regular structure), scores 0% correct; the
  hardest, D (infinite scroll), scores 50%. Difficulty is not the driver - required field
  count is (bucket A cases ask for a median of 3 fields, bucket D includes 3 single-field
  cases).
- **Field-level recall 36%** (39 matched / 55 missing / 14 weak of 108 requested fields).
- **Not a labelling artefact.** Of the 45 non-correct cases, 38 have a genuinely missing
  field; only 7 have every value present and fail on count or field name alone.

## 5. Field-level F1, replayed from the committed digests (added later the same day)

Every run above was re-scored offline with the harness's own field-level scorer
(`--replay`, no model calls). All three replayed item counts match the recorded runs, so
these numbers are reproducible from the repository without a key.

| Run | Build success | Field F1 | Precision | Recall | Item count in range |
|---|---|---|---|---|---|
| `2026-09-17T23-37-02` (current prompt) | 90.0% | **38.0%** | 40.2% | 36.1% | 28% |
| `2026-09-19T09-16-01` (current + `hitCount`) | 88.0% | **38.8%** | 40.8% | 37.0% | 28% |
| `2026-09-19T09-29-16` (reverted to pre-2-4) | 80.0% | **35.9%** | 40.2% | 32.4% | 24% |

108 field instances in each run (50 cases, however many fields each asks for).

Three things this adds:

- **The null result is confirmed on the second gate too.** The `hitCount` rule moved F1
  38.0 -> 38.8 (+0.8 pp). That is inside the +/-4pp band, so the honest reading is still
  *no effect*, now measured on two metrics instead of one.
- **The prompt gain survives on correctness, not only on build.** 35.9 -> 38.0/38.8 F1
  (+2 to +3 pp) against +8 to +10 pp on build success. The gap between those two is the
  whole point: most of what the prompt work bought is tools that run, not tools that
  return the right fields.
- **Recall 36.1% reproduces the hand-computed figure in §4 exactly** (39 matched of 108),
  which is the cross-check that the in-harness scorer and the standalone pre-labelling
  script agree.

**One definition changed, and it is worth stating.** The 48.4% F1 quoted earlier in this
file's review cycle used precision = `matched / (matched + weak)`. The committed
definition is precision = `matched / (matched + weak + extra)`, where `extra` counts
produced columns nobody asked for. Invented columns are a real failure mode — they are
why a run can extract everything asked for and still hand the user a table with a column
that does not exist on the page — so they belong in the denominator. Under the committed
definition, recall is unchanged at 36.1% and F1 is 38.0%, not 48.4%. The higher figure
should not be quoted.

## 6. Known issues

- **Fixed later the same day for everything after this run**: `results/*.json` is still
  gitignored, but every run now also writes a committed `digests/<run-id>.json`, which
  replays to the same item counts (§5). Numbers in this file are reproducible from the
  repository with no key. The "round-1 result went missing" failure mode cannot recur for
  any run recorded from here on.
- The 1-field finding rests on 7 cases. It is the most actionable number here and the least
  reliable; it needs more single-field corpus cases before it can be stated publicly.
- Noise is ±4pp. No single-run change smaller than that should be called an improvement.
