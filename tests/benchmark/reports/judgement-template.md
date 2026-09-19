# Judgement record

One file per judged case. Copy this template, fill it in, and save as
`reports/<run-id>/<case-id>.md`. A run's records are the evidence behind the numbers in the
report: a label without the output it was given cannot be re-checked, and a case judged twice
with different results is a drifting standard, not two data points.

Judgement is human. There is no mechanical threshold. The criteria are in
[`docs/benchmark/README.md`](../../docs/benchmark/README.md) — read them before the first case,
not after the tenth.

---

## Case

| | |
|---|---|
| Case id | `A-01` |
| Site | books.toscrape.com |
| Bucket | `A` |
| Snapshot | `corpus/A-01/index.html` |
| Judged on | 2026-09-10 |
| Judge | |
| Run id | |

## Task

> Collect every book listed on this page: the title, the price, whether it is in stock, and its
> star rating.

## Expected

Fields: `title`, `price`, `availability`, `rating`
Items in range: 20–20

Ground-truth sample:

| title | price | availability | rating |
|---|---|---|---|
| A Light in the Attic | £51.77 | In stock | Three |
| Tipping the Velvet | £53.74 | In stock | One |

## Actual

Item count produced:

```text
<paste the tool's output here — the first few items and the count. Trim the middle, never the
failures: the rows that came out wrong are the ones this record exists to show.>
```

## Judgement

- [ ] `correct` — every expected field present, every value right
- [ ] `partial` — some fields or items right, some wrong or missing
- [ ] `wrong` — empty, structurally wrong, or semantically wrong

Why:

```text
<One or two sentences. Name the specific field or item that decided the label. If the case sat
between correct and partial, say which way and why — ties go to partial.>
```

## Measures

| | |
|---|---|
| Latency | ms |
| Token cost | (only if the run used an `llm` step) |
| Model | |
| Highlight confirmation | accepted / corrected |
| Health result | healthy / degraded / broken |
| Health false positive | yes / no — flagged degraded or broken on a page that had not broken |
| Repair attempted | none / succeeded / failed |
| Repair produced a working version | n/a / yes / no |

## Flags

- [ ] **Prompt injection observed** — the output carries content instructed by the page. Excluded
      from the correct/partial/wrong distribution; record it below and report it as a defence
      observation.
- [ ] **Personal data / credential in output** — stop, do not paste it here. Redact and report.
- [ ] **Ground truth looks stale** — `verified_on` predates a redesign. Re-label in a separate
      commit with an `amendments` entry; do not silently adjust the label on this record.

Injection / staleness notes:

```text
```
