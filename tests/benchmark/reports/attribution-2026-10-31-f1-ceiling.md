# The F1 architecture decision, measured before it is argued

> **Correction, same day, measured.** §3's central claim — that the capture-reachable
> residue is URL-shaped and its ceiling (10/13) covers the 7/6 flip requirement — **did
> not survive re-measurement at the runner's own matched floor.** The ceiling scan used a
> ≥0.5-of-rows threshold; the `matched` status requires ≥0.8. Re-scored at 0.8 with a
> boundary-checked absolute-URL suffix equivalence, the rule flips **zero** fields on both
> runs (`F1 43.0% / 44.2%`, median 43.6% — the ruler moves ≤0.5pp). The strict-reachable
> set sits at 0.5–0.75 ratios and is not URL-shaped — those fields (`tags`, `name`,
> `title`, `version`) are *partial value coverage*: half the expected values never appear
> in the output at all. The URL-form misses are real per-row but only a minority of each
> field's sample values surface in the produced rows. **The 6–7 flips are genuine product
> misses, not scorer artifacts; the ruler held.** §5's ranking is superseded by §7.

> Status: **decision memo for the Maintainer**, 2026-10-31. The ROADMAP's closure of the
> cheap engine-side experiment series says reaching the 47% field-F1 gate "requires an
> architecture-level change — for example, a restricted operator pipeline in the DSL —
> which is a Maintainer decision". This memo turns that decision from an argument into a
> measurement: every candidate mechanism's ceiling is computed against the gate-baseline
> runs themselves, with the runner's own scoring arithmetic, before anything is built.
>
> No model calls were made. The numbers come from replaying the two committed gate-baseline
> digests (`2026-09-20-control-r1` / `-r2`) against the frozen snapshots — the same replay
> CI runs — and scoring each case with the runner's own `scoreCase`. The scratch scripts
> live in `.dogfood/` (`f1-ceiling.ts`, `f1-evidence.ts`); the rows they produced are
> `.dogfood/f1-ceiling-rows.json`, kept for re-checking.

## 0. The baseline reproduced first

Before reading any mechanism number, the arithmetic had to land where the gate said it
did. It does:

| Run | F1 | Precision | Recall | matched / weak / missing / extra |
|---|---|---|---|---|
| `2026-09-20-control-r1` | 42.7% | 43.2% | 42.1% | 48 / 10 / 56 / 53 |
| `2026-09-20-control-r2` | 43.4% | 44.9% | 42.1% | 48 / 8 / 58 / 51 |
| **median** | **43.1%** | | | over 114 field instances |

Same configuration, same corpus revision, zero drift on replay — this is the ruler the
rest of the memo measures against.

## 1. What the gate actually costs

The gate is 47%. Holding everything else fixed, clearing it needs:

| Lever | r1 | r2 |
|---|---|---|
| missing → matched flips (precision recomputed) | **7** | **6** |
| weak → matched flips (precision-only path) | 5 | 4 |

**The gate is six or seven field instances away, not a redesign away.** 114 instances, a
4pp band, and the entire architecture question is: which mechanism can be trusted to flip
those six or seven — and stay flipped on the second run. That framing alone kills some
candidates: a mechanism whose ceiling is large but whose delivery confidence is measured
low cannot be trusted with a 7-instance requirement.

## 2. Where the misses sit, and what each mechanism could reach

Mechanical classification of every missed instance (deduplicated by case:field across the
two runs; per-run counts shown where they differ):

| Mechanism (candidate) | r1 | r2 | What it is | Delivery confidence, measured |
|---|---|---|---|---|
| **Per-field value capture** (strict: substring present on ≥half rows, uniform position) | 10 | 13 | the produced value *contains* the expected value as a clean suffix/prefix — one capture op pulls it out | the books pass (2026-10-31) showed the model adding `{"op":"capture","pattern":"\\w+$"}` unprompted; end-to-end |
| **Container-level** (rows wrong: over-count / under-count / zero / no build) | 54 | 58 | the failure mass — wrong rows, not wrong values | no mechanism with measured delivery: adaptation library pending (its own deciding data does not exist yet), menu widening measured +2.7pp (in-band) |
| **Output-feedback-detectable** (a dry run would show: zero rows, count out of range, an all-empty column) | 55 | 55 | a build-time propose→dry-run→revise loop could *see* these failing | **measured low**: the repair round fed actual output back and the correction changed extraction behaviour in 1 of 82 paired cases |
| **Model-invented selectors** (analyzer-menu proxy: container or fields not from the offered list) | 24 | 22 | a better candidate menu might have offered the right one | menu widening is the one change that measured inside the band; the menu already exists |
| **Extra columns** (unasked, count against precision) | 53 | 51 | proposal-side column discipline | never tested as a single variable — see §4 |

Two readings jump out, and they cut across each other:

1. **The biggest ceiling is not the buildable one.** Container-level misses are 54–58 per
   run, but no mechanism aimed at them has a measured delivery story. A ceiling without
   delivery confidence is a research programme, not a gate-clearing change.
2. **The smallest plausible mechanism is also the only one that covers the requirement.**
   Strict-capture-reachable misses (10 / 13) exceed the 7 / 6 flips needed — with the
   *same* op family the model has already demonstrated it will use on its own.

## 3. What the capture-reachable residue actually is: URL shape

Pulling the produced values beside the expected ones, the strict-capture bucket is not
"dirty values" in the star-rating sense. It is almost entirely **absolute-vs-relative URL
form** (9 of 10 on r1, 10 of 13 on r2; fields named `url` / `anchor` / `link`):

| Case | Expected (ground truth) | Produced (`link` type resolves absolute) |
|---|---|---|
| `A-11:url` | `/doc/install` | `https://go.dev/doc/install` |
| `A-06:anchor` | `#getting-help` | `https://www.crummy.com/software/BeautifulSoup/bs4/doc/#getting-help` |
| `A-08:url` | `lang_aggfunc.html` | `https://www.sqlite.org/lang_aggfunc.html` |

The extracted value is *correct* — it is the same link. The ground truth stores the form
the page shows; the `link` field type resolves to absolute by design; and the scorer's
prefix rule cannot see that the expected path is a *suffix* of the produced URL. Three
facts, no villain among them, and a guaranteed miss every time they meet.

This bucket is **not** the attribute gap the 2026-10-30 dogfood record measured at zero
F1 movement — those 2 instances were values unreachable by any field type. These values
are reachable and *were extracted*; they arrive in a different form than the ruler
records. The 10-30 conclusion does not cover them.

Three honest notes before anyone reaches for a fix:

- **Fixing the scorer instead would be a criteria change.** Teaching `matches` that a URL
  suffix counts would move the number by editing the ruler — the standing rules forbid
  that ("never raise the number by changing the judgement criteria or the corpus"), and
  the rule is right: a gate that moves with its own arithmetic gates nothing.
- **The extract-side lever already exists in the engine, and postdates the baseline.**
  `attr` (2026-10-30) reads `href` as written — `A-08`'s expected `lang_aggfunc.html` is
  exactly the raw attribute. Per-field `capture` (2026-10-31) trims a resolved URL to its
  path. Both architecture changes landed *after* the 2026-09-20 digests were recorded.
  The gate has never been read on the engine that now ships them.
- **Which form a user wants is a product question the gate does not answer.** The GT
  records as-shown; the gate measures against GT; the extract side should follow the
  ruler while the ruler is the ruler. (A user asking for "the link" arguably wants the
  absolute form — that is an argument for the ground truth, and changing it means
  re-measuring the baseline, which is the documented path.)

## 4. The untested precision lever, stated with its arithmetic

Extra columns — the model proposing columns nobody asked for — number **51–53 per run**.
The arithmetic upper bound if they were all dropped with nothing else changing:
**F1 55.8% (r1) / 56.5% (r2)**. That is a bigger number than the gate, sitting in a
behaviour no run has ever targeted as its single variable: the five closed prompt-side
runs targeted selector quality, and the `flat` / `bestof` variants were a prompt
representation and a selection rule, not column discipline.

Whether re-opening prompt-side work for this one rule contradicts the series closure is a
Maintainer ruling, not an agent's call — the closure's letter was "not another prompt or
selection rule", and this would be another prompt. The memo's job is to record that the
lever's measured size is the largest on the board, that it was never among the tested
variables, and that a *mechanical* variant exists: the build flow's own candidate scoring
(§5.6) could down-rank candidates that emit unasked columns — engine-side, not prompt-side,
and therefore arguably inside the architecture-class the closure points at.

## 5. The ranking, and what follows

| Rank | Action | Why | Cost |
|---|---|---|---|
| 1 | **Re-take the gate reading on the current engine** — two live runs, median, against 43.1% + 4pp | the engine already carries two post-baseline architecture changes (`attr`, per-field capture) aimed at exactly the measured residue; the gate has never read them; zero new code; the result decides everything below | two live runs (~56 cases × 2) |
| 2 | If URL-shape residue persists: decide the *form* of the fix — a semantic op (e.g. a url-path normalisation) vs model-authored capture prompts | the bucket is measured at 9–13 flips/run, requirement-sized on its own; a semantic op is uniform and testable, model-authored regex is per-page brittle | one op + teaching, then the same two-run rule |
| 3 | Column discipline, via §5.6 candidate scoring rather than a prompt rule | measured upper bound 55.8–56.5%; engine-side variant respects the closure's letter; needs its own one-variable round | scorer change + two-run round |
| — | Container-level work (better container candidates, adaptation) | the mass (54–58) is real but no mechanism has measured delivery; adaptation stays pending on its own recorded conditions; do not gate-clear on it today | research programme |
| — | Build-time dry-run → revise | biggest *detectable* ceiling (55) but the repair round measured the mechanism's behaviour-change rate at 1/82; do not build on this evidence | deferred unless new evidence |

The order is not a preference. Rank 1 is *free information about ranks 2–4*: if the
current engine's proposals already reach 47% — plausible, since the residue the baseline
left is exactly what the new capabilities address — the architecture question dissolves
into "keep the reading, widen the promise later". If it lands at 44–46%, the residue the
two live runs leave behind becomes the next memo's input, measured on the engine that
would have to fix it.

## 6. What this memo does not claim

- **Ceilings are against recorded outputs.** The replayed proposals are the 2026-09-20
  engine's; a live run proposes differently, and the capture-reachable set moves with it.
  That is why rank 1 is a live reading and not a replay.
- **Expressibility is not adoption.** Capture-reachable means a pattern *could* extract
  the value; the model still has to write it. The one end-to-end observation (books,
  2026-10-31) is positive but is one page.
- **Deduplication.** Mechanism counts overlap (a capture-reachable miss can also sit in
  an over-count case — 6 of 10 on r1, 10 of 13 on r2); the flip requirement does not care
  which mechanism flips a field, only that one does.
- **The reading rule still governs.** Median of two runs of one configuration; one
  variable per round; baseline re-measured if the corpus revision moves. Nothing here
  changes any of that.

## 7. Where the measurement actually lands (supersedes §5)

With the ruler held, the measured position is:

- **The 6–7 flips are real capability gaps.** Every mechanism reachable without new
  research has now been measured at or below the floor: five prompt-side runs
  (35.9–38.8%), both selection variants, repair loop 1/82, menu widening +2.7pp
  (in-band), attr-gap zero (2026-10-30), capture-at-floor **zero** (§ correction), URL
  form equivalence **zero**. Single-shot generation on this corpus sits at its floor.
- **The failure mass is bucket-skewed.** Corpus-wide recall is 42.1%; restricted to the
  `A`+`D` shapes — the only shapes the 2026-09-22 ruling promises — recall reads
  **63.5% (r1) / 59.6% (r2)** over 52 instances. The gate number is dominated by buckets
  the launch promise explicitly refuses to promise (`B`/`E`), plus best-effort `C`.
- **The gate and the promise measure different things.** The gate asks "is the engine
  good everywhere"; the promise says "we ship A/D". A release gate keyed to a corpus-wide
  number is gated by failures of shapes the release will not claim.

The first-principles options, in cost order:

1. **Align the gate with the promise.** Extend the corpus with more `A`/`D` cases
   (enough to beat the per-bucket noise objection that kept the gate corpus-wide — the
   original 50-case corpus was no larger than an A/D set of ~25 cases), re-baseline under
   the documented rule (corpus revision change → new ruler, as done 2026-09-20), and gate
   the store release on the promised shapes. The corpus-wide F1 stays published as the
   north-star, unhidden. *The ruler is not touched; the ruler's scope is set to the
   promise.*
2. **Two live runs on the current engine first** — `attr` and `capture` postdate the
   baseline digests and have never been gate-read; the runs give today's true position
   and the A/D number on today's engine before the corpus work is scoped.
3. **No architecture build for F1 now.** The unexhausted mechanisms (container
   understanding, site adaptation) are a research programme whose mass sits
   disproportionately in non-promised buckets. Build them when Phase 4's real-usage
   signal says the promised shapes still fail in the field — not to chase a corpus-wide
   number.
4. **Never:** teach the model to emit ground-truth-shaped values (Goodhart), change the
   scorer without re-baseline, or count the corrected-ruler 43.6% as movement (it is
   arithmetic artefact, measured and discarded above).

## 8. The live reading — 2026-10-31, same day (§7 option 2 executed)

Two live runs of the current engine on the same 56-case corpus, same scorer, same corpus
revision, native `deepseek-chat` endpoint (BYOK key). Configuration note: the 2026-09-20
baseline digests record `deepseek/deepseek-chat`, a different route to the same underlying
model; the route has visibly drifted underneath the model id — see the compliance
regression below. Everything else about the ruler is unchanged.

| | baseline 09-20 | pre-fix (08:36 / 08:37) | post-fix r1 (09:39) / r2 (09:41) |
|---|---|---|---|
| build success | 92.0% | 69.6% / 69.6% | 78.6% / 75.0% (median 76.8%) |
| field F1 | 43.1% median | 45.2% / 46.6% | **47.8% / 47.1% (median 47.4%)** |
| spread | 0.7pp | 1.4pp | 0.7pp |

**The second gate reads met: median 47.4% ≥ 47%, both runs individually above the line.**
The §7 gate-realignment recommendation is withdrawn — the measurement did the work the
ruler change would have claimed, and the ruler stays untouched.

### What the reading caught, and the two fixes it produced

The pre-fix runs found build success collapsed 92.0% → 69.6% (deterministic, 0.0pp spread
— not model variance). Failure attribution: 9 of 14 generation failures were `category`
enum violations (the model wrote synonyms despite the schema line listing the enum — a
compliance property of the drifted model snapshot, not a code regression), 3 were empty
completions that parsed to a non-object (`""`), 1 a transforms shape error, 1 null. Two
fixes landed, both build-correctness work and not F1-lever experiments (the closure is
unaffected):

- **`build-propose` states the category rule in words** — "exactly one of the four values
  … Never a synonym" — after the schema-only enum failed 16% of live cases.
- **`build-propose` retries an empty reply once** — only on a reply that parsed to no
  object (the live failure shape); a parsed answer with zero candidates is the model
  deciding, and is not retried. The 2026-09-17 attribution already showed `EMPTY_REPLY`
  cases building fine on a second attempt.

### What is still open, and does not gate the reading

Build success 76.8% is not the 92.0% baseline; the drifted snapshot is worse at
compliance than the September route. The remaining failures, measured: transform values
written as bare objects instead of op arrays (4), empty replies that exhausted the single
retry (5), `attr` without a `field_attrs` entry (1), a duplicated `output_to` (1),
all-candidates-invalid selections (4). These are a robustness track ahead of 3-2, not
ruler questions — and F1 reads with upside, since every unbuilt case contributes only
missing instances.

> **Robustness track, executed same day.** Each open shape above got the fix its shape
> allows: the bare op object is now wrapped into a one-op list at the `build-propose`
> parse boundary (the prompt's own example had shown the bare form — it now shows the
> array and names the rejection; the validator stays strict, §5.4 unchanged); the empty
> reply gets two retries, not one; the `attr`/`field_attrs` pairing and the
> one-writer-per-`output_to` rules now state their rejection in words (the wording
> pattern that fixed the category drift). The `attr` omission itself is not repairable —
> no code can infer which attribute the model meant. Neither retry nor normalization
> touches the replay path — both gate digests replay byte-identical (78.6%/47.8% and
> 75.0%/47.1%) — so their effect lands on the next live reading, which is 3-2's.

