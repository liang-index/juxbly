# Scope

Juxbly is deliberately narrow. This page exists so you can tell **"not built yet"** from
**"decided against"** — only the first kind is a pull request waiting to happen.

Everything here is a constraint, not a preference: a change to this list has to change
`docs/ARCHITECTURE.md` in the same pull request, and goes through the process in
[`DOC_CHANGE_PROTOCOL.md`](DOC_CHANGE_PROTOCOL.md).

## Not in V1

| Area | Not in V1 | Why |
|---|---|---|
| DSL | `if` / `else` / `for` / `while` / `map`, arbitrary expressions, `eval` | The DSL carries configuration, never code. Rising complexity means a new, semantically named capability — not a more expressive DSL. |
| Steps | condition / loop steps | They need Orchestration (scheduling, background execution), which V1 does not implement. |
| Tool category | `monitor` | Monitoring needs scheduled / background execution, so no V1 capability could produce such a tool. Returns as a pure enum addition when Orchestration lands. |
| Views | charts | Three views ship in V1: table, card, text. |
| Export | webhook, Markdown | V1 exports copy / CSV / JSON. |
| Results | result history, "last run vs this run" diff | Needs result snapshots. The data slot is defined in V1; the behaviour is not. |
| Health | silent auto-repair | A failing tool is never rewritten in the background. Repair produces a **new, user-confirmed version** and the old one stays available. |
| Appear | usage-based grading (Active / Quiet / Archived) | V1 has no 30-day usage history, so the grading would be dead code. Deletion (user initiated, double confirmed) is the only exit. |
| UI | panel drag position memory, voice input | Deferred; neither blocks the closed loop. |
| Page watching | `MutationObserver` session watching | Out of V1 scope. |
| Editing | JavaScript sandbox, arbitrary script editing | The model emits configuration. A sandbox would reintroduce exactly the risk the DSL exists to avoid. |
| Confidence | a confidence score per result | Tried and falsified before implementation; it did not predict correctness. |
| Versioning | a standalone version-switcher UI | Rollback lives in the config panel. V1 users have few tools; a separate management surface is not worth it. |

## Capability boundaries

Measured, not assumed. The sample of 2026-09-04 was ten sites; the readings below come from
the Phase 2 corpus — 56 cases, two runs, 112 case-runs — as field-level F1, recomputable
with `scripts/bench-breakdown.mjs` from the recorded digests:

| Page shape | Field F1 | Launch status |
|---|---|---|
| Semantic structure (tables / lists) | 64.7% | **Promised** |
| Lazy-loaded / infinite-scroll lists | 55.9% | **Promised** |
| Shadow DOM / custom elements | 41.6% | Best effort |
| Client-rendered SPA | 21.3% | Not promised |
| Hashed / generated class names | 18.4% | Not promised |

The store listing and the launch preset pack promise the first two shapes and nothing else
(Maintainer ruling 2026-09-22). This narrows the promise, not the product: the engine still
runs on every shape above, and a shape moves up when a new reading on the same ruler says
so. `docs/ROADMAP.md` carries the gate that holds back the release.

Best effort means it may work and may not. When it does not, the UI says so rather than
showing an empty result — and nothing in Juxbly's documentation or store listing may
imply "works on any website".

## Unverified — do not promise

Two mechanisms in the build flow are implemented but **not yet validated by
measurement**:

- **Vision fallback** (screenshot + multimodal model) for pages the DOM route fails on.
- **Retrying with a stronger model** as a later escalation step.

Neither has a measured effect. Until one does, no user-facing documentation, store copy,
or issue triage may describe them as working.

## Proposing a change

Open an issue first. For anything on this page, say which constraint it would replace
and what evidence supports the change — a pull request that quietly widens the DSL will
be rejected on scope grounds, not on code quality.
