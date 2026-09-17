# Failure attribution — 2026-09-17

Runs covered:

| Round | Run id | Build Success Rate | Prompt state |
|---|---|---|---|
| 1 | `2026-09-17T15-37-04-133-deepseek_deepseek_chat` | 72.0% | baseline prompt |
| 2 | `2026-09-17T15-50-52-905-deepseek_deepseek_chat` | 80.0% | + `url_pattern` form rule |
| 3 | `2026-09-17T16-01-06-327-deepseek_deepseek_chat` | 78.0% | + selector-form rule (**reverted**, see below) |

Model `deepseek/deepseek-chat` — `openai/gpt-4o-mini` is blocked for this region on OpenRouter (403), see the stage 2-3 section of `MANUAL_ACCEPTANCE`. Corpus revision `2026-09-10T16:28:04.724Z`.

## Scope

- This pass attributes **build failures only**: generation errors, execution errors, and runs that extracted nothing. The 36 (round 1) and 40 (round 2) cases that built are **still unjudged** — the runner does not grade itself, so they are `pending` and never counted as wrong. The wrong/partial part of stage 2-4 AC 1 cannot be finished until a person labels them.
- The five kinds follow `task/stage-2-4.md`: `zero-match`, `wrong-element`, `field-semantics`, `structure-changed`, `invalid-output`.
- Every row carries an evidence excerpt (hits, the selector the model wrote, the error text). Where a row could go two ways it is recorded in the more conservative kind.

## Round 1 (72.0%, 14 failures)

| Case | Bucket | Kind | Evidence | Suspected cause |
|---|---|---|---|---|
| A-06 | A | invalid-output | `Invalid url_pattern "*://**/bs4/doc/*"` | host written as a wildcard |
| A-07 | A | invalid-output | `Invalid url_pattern "*://www.postgresql.org/docs/current/functions-math.html"` | same |
| D-03 | D | invalid-output | `Invalid url_pattern "*://mastodon.social/explore"` | same |
| A-10 | A | invalid-output | `EMPTY_REPLY` | model returned nothing |
| E-01 | E | invalid-output | `EMPTY_REPLY` | same |
| E-06 | E | invalid-output | `EMPTY_REPLY` | same |
| A-01 | A | invalid-output | asked two clarifying questions, then gave up | request read as underspecified |
| E-09 | E | invalid-output | asked two clarifying questions, then gave up | same |
| B-10 | B | invalid-output | `steps[1].view: view must be "table", "card" or "text"` | view outside the enum |
| B-04 | B | invalid-output | `SELECTOR_SYNTAX` | selector not accepted |
| C-01 | C | zero-match | ran clean, 0 items | custom-element chain across a shadow boundary |
| C-03 | C | (environment) | `RATE_LIMIT` | **infrastructure, not a product failure** |
| C-04 | C | (environment) | `RATE_LIMIT` | same |
| C-05 | C | (environment) | `RATE_LIMIT` | same |

## Round 2 (80.0%, 10 failures)

| Case | Bucket | Kind | Evidence (selector the model wrote / error) | Suspected cause |
|---|---|---|---|---|
| B-05 | B | invalid-output | `"h1, h2, h3, h4, h5, h6"` → `SELECTOR_SYNTAX` | **comma list**: one step takes one selector |
| C-08 | C | invalid-output | `"h2"`, `fields {"heading": ""}` → `SELECTOR_SYNTAX` | **empty field selector** |
| C-03 | C | invalid-output | `"li>ul>li"`, `fields {"name":"a","description":""}` → `SELECTOR_SYNTAX` | empty field selector |
| E-10 | E | invalid-output | `fields {"variable_name":"nth-child(1)", …}` → `SELECTOR_SYNTAX` | **`nth-child(n)` without the colon** |
| B-04 | B | invalid-output | `fields {"title":"h3","link":":self"}` → `DOM_UNAVAILABLE` | `:self` is not supported |
| C-05 | C | invalid-output | `steps[1].view: view must be "table", "card" or "text"` | view outside the enum (same class as round 1, unfixed) |
| B-08 | B | invalid-output | asked two clarifying questions, then gave up | underspecified |
| E-02 | E | invalid-output | asked two clarifying questions, then gave up | same |
| E-09 | E | invalid-output | asked two clarifying questions, then gave up | same |
| C-01 | C | zero-match | `chromedash-all-features-page>chromedash-feature-table>chromedash-feature-row`, `fields {"name":"td>a","link":"td>a"}`, 0 items | custom-element chain across a shadow boundary; `queryAll` does not pierce it |

By bucket (round 2): A 0 / B 3 / C 4 / D 0 / E 3. A and D are clean; B, C and E carry every failure.

## Round 3 (78.0%, 11 failures) — the selector-form rule did not hold, and was reverted

The added rule: one selector per step, no comma lists, non-empty field selectors, positional selectors carry the colon. Result **80.0% → 78.0%**:

| Case | Bucket | Kind | Evidence | Note |
|---|---|---|---|---|
| B-04 | B | invalid-output | `div>div>a` / `{"title":"h3","link":""}` → `SELECTOR_SYNTAX` | empty field selector **still there** |
| C-07 | C | invalid-output | `nav>ol>li>a` / `{"title":"","link":""}` → `SELECTOR_SYNTAX` | same |
| E-03 | E | invalid-output | `div>ul>li>a.MuiTypography-root` / `{"title":"","details":"span"}` → `SELECTOR_SYNTAX` | same |
| C-08 | C | zero-match | `div>article>h2` / `{"heading":""}` → 0 items | same, and it does not even error |
| C-01 | C | zero-match | custom-element chain across a shadow boundary, 0 items | the same case as round 2 |
| A-06, B-08, D-06, E-09, E-10 | A/B/D/E | invalid-output | asked two clarifying questions, then gave up | **rose from 3 to 5** |
| B-10 | B | invalid-output | `EMPTY_REPLY` | new |

The rule did not remove empty field selectors (three survived) and it made the model more cautious — two-question abandonments went up. Net −2.0pp. Reverted; the tree keeps the round-2 prompt.

**What it did expose is not a prompt problem.** The model writes `""` or `:self` when it wants the element itself, and both are rejected (`:self` → `DOM_UNAVAILABLE`, `""` → `SELECTOR_SYNTAX`). The DSL has no way to say "take this element", so no prompt can fix it. That needs a Maintainer ruling before the next round: add the semantics to the DSL, or steer the model to a spelling that exists.

## A mechanism worth carrying forward: earlier failures hide later ones

The three `url_pattern` failures of round 1 happen at **validation** — a tool that does not validate never runs, so whatever is wrong with its selectors stays invisible. Once the pattern validates, execution runs and `SELECTOR_SYNTAX` is free to surface (1 → 4), and at least C-03 was already broken behind a pattern that used to fail first.

So the size of any improvement is distorted by what it unblocks, and reading only the headline number mis-scores it. Every round therefore reports buckets and failure composition alongside it: round 2 was A +33.3 and D +12.5 while B went −10.0.

## Still open

1. **Human judgement.** All 50 cases are `pending`. `wrong-element`, `field-semantics` and `structure-changed` cannot be attributed without labels.
2. **Repeat sampling.** No prompt was run twice. Model output varies between runs (three `RATE_LIMIT` and three `EMPTY_REPLY` disappeared between rounds 1 and 2 on their own), so a single round difference is not fully attributable to the prompt change.
