# Selector quality

> Status: measured, not solved. This is a living document: the numbers come from
> `tests/benchmark/reports/attribution-2026-09-17.md` and move as the benchmark moves.

Selector quality is the highest-priority problem carried over from M0, and it has no
one-time fix. What stage 2-4 changed is the unit of discussion: instead of "selectors are
bad", each case now has a kind, and each kind has a count that moves when something changes.

## What the first honest measurement says

On the round-4b run (`2026-09-17T23-37-02-112`, `deepseek/deepseek-chat`, 50 cases — the
second of two runs of the same prompt, which came back 86.0% and 90.0%):

| Metric | Value |
|---|---|
| Build success rate | 90.0% (86.0% on the identical run before it) |
| Judged `correct` | **10%** (5 of 50) |
| Judged `partial` | 60% (30) |
| Judged `wrong` | 30% (15) |

**A tool that builds is not a tool that is right.** Nine in ten produced something; one in
ten produced something correct. The gap between those two numbers is the actual work, and
any report that shows build success alone hides it.

Attribution across all 50 cases (not only the failures):

| Kind | Count | What it means |
|---|---|---|
| `wrong-element` | 24 | the rows are the wrong rows: too many, too few, or the wrong container |
| `field-semantics` | 21 | the right container, the wrong reading out of it |
| `invalid-output` | 4 | the DSL itself did not validate or the selector did not parse |
| `zero-match` | 1 | a valid selector that hit nothing |
| `structure-changed` | — | never assigned: see below |

By bucket (`correct` / `partial` / `wrong`): A 0/11/1 · B 0/6/4 · C 1/6/3 · D 4/2/2 ·
E 0/5/5. Four of the five `correct` are in bucket D, whose ground truth asks for a single
field, so the bucket comparison is a measure of how much was asked for, not only of how hard
the site is.

**Repeat sampling sets the error bar.** The same prompt run twice gave 86.0% and 90.0%. A
difference smaller than roughly 4pp is not attributable to a change — which is why round 3's
−2.0pp was noise, and why round 2's +8.0pp counted only because it also drove a named failure
class to zero.

## Three findings that changed what we did

**Earlier failures hide later ones.** `url_pattern` was rejected at validation, so the tool
never ran and whatever was wrong with its selectors stayed invisible. Fixing it moved build
success 72% → 80% *and* let `SELECTOR_SYNTAX` surface (1 → 4). The improvement looked bigger
than it was, and the new failures were not regressions — they were always there. Any round
has to be read as buckets plus failure composition, never as one number.

**A missing word in the DSL becomes a model failure.** The model writes `""` or `:self` when
it wants the element itself. Both were rejected, so a tool that had already found its rows
failed anyway. Telling the model not to do it did not work — that round went 80% → 78% and
made it *more* cautious (two-question abandonments 3 → 5). The fix was to add the word:
`":self"` (§5.2), with an empty field selector now rejected at save time as
`FIELD_SELECTOR_EMPTY` so it fails where the author can see it instead of mid-run. Twelve
cases write it now; the empty selector is gone from the output; build success went to 86% and
90% on two runs.

**Unblocking a build moves the failure, it does not remove it.** Of the ten points gained,
almost none became `correct` — `field-semantics` grew 18 → 21, because `":self"` on a
container returns the whole card's text where a single field was wanted. Failures migrate to
the next layer down every time the previous one is fixed, so the composition has to be read
alongside the count or the improvement is overstated.

**Prompt rules have a cost.** Round 3 added constraints that were true and unhelpful: the
model complied by asking more questions rather than by choosing better selectors. A rule is
only worth its tokens if it removes a failure it names.

## The site adaptation library: deferred, with the data that would decide it

Building per-site selector knowledge has three answers — build it, do not build it, or
pending validation. The answer is **pending validation**, and the reason is that the corpus
cannot support the other two:

- One snapshot per site, and failures migrate between rounds. There is no observation of the
  same site failing the same way twice, which is the only thing a per-site fix would exploit.
- The dominant kinds are not site knowledge. `wrong-element` and `field-semantics` are
  generic selector-quality failures; a per-site selector would have fixed one case
  (C-01, a custom-element chain across a shadow boundary) out of fifty.
- The maintenance question has no answer yet. "Who updates it when the site redesigns, and
  how is the break detected" needs the health and repair layers (Phase 3) to exist first.

What would decide it, written down so the next pass is a measurement and not an argument:

1. The same site failing with the same kind across **two or more rounds** while the generic
   prompt stays fixed — evidence of a site property rather than a generation miss.
2. A count of how much of the failure mass is concentrated in **few sites** rather than
   spread evenly. Evenly spread failures are not an adaptation problem.
3. A health signal that detects the break, so a stale entry is found before a user reports it.

## Standing rules for anyone iterating here

- One variable per round. Two changes make the delta unattributable, which is the same as
  not measuring.
- Never raise the number by changing the judgement criteria or the corpus. Both are the
  easiest way to improve a metric and the reason the number would stop meaning anything.
- Every attributed case carries an excerpt — hits, the value produced, the value expected. A
  kind without evidence cannot be re-checked, and a standard that cannot be re-checked drifts.
- `structure-changed` stays unassigned offline: deciding it needs two captures of the same
  site at different times, and the corpus holds one per site.
