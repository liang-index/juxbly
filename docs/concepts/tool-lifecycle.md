# Concept: the Tool Lifecycle

The central object in Juxbly is the **Tool** — a persistent mini-application bound to a page pattern. Not a prompt, not a conversation, not a script.

```
Discover → Build → Confirm → Save → Run → Deliver → Health → Repair → Version → Reuse
```

This document explains each step in product terms. The authoritative types are in [`../ARCHITECTURE.md`](../ARCHITECTURE.md); this file only explains *why* the steps exist and *which module owns what*.

## Discover

The user has a need on the page in front of them. Juxbly's entry point is the floating ball: near-invisible when there is nothing to do, a single pulse on load when a saved tool matches the page.

- Owned by: `packages/ui` (ball), `packages/dsl` (`matchUrl`).
- Why it matters: Remember → Recognize → Appear. A tool the user has to go find is a tool they have already forgotten.

## Build

The user describes the need in natural language. Juxbly may ask up to **two** clarifying rounds — focused on "what's on the page" and "what do you want", never open-ended. Then it analyses the page and produces a Tool DSL draft.

- Owned by: `packages/analyzer` (`analyzePage`), `packages/llm` (prompt + injection defence), `packages/dsl`.
- Two non-obvious constraints:
  - The model never sees the raw full DOM. It sees simplified visible text, structure features, and the **actual custom-element tag names** present, with open shadow roots expanded. This is a token-cost decision and a correctness decision (M0 showed outdated tag names are a top failure cause).
  - The model emits **configuration**. There is no path from model output to executed code.

## Confirm

Every first build and every rebuild goes through on-page highlight confirmation, with no confidence-based exception. The highlight is the product's single signature animation.

- Why: M0 showed that even on well-structured pages, fields get semantically mis-assigned (a header captured as data, two fields capturing the same value). Only the user looking at it can tell.
- The user can confirm, click a highlighted box to correct it, or send it back to clarification — not restart the whole conversation.

## Save

The definition is validated and stored with `version = 1`.

- Owned by: `packages/dsl` (validation), `packages/storage`.
- Validation happens here **and** again before every execution. Unknown fields or unknown step types are rejected rather than ignored — a DSL that silently tolerates unknowns is a DSL that drifts.

## Run

On a matching page, the tool runs automatically.

- `extract` runs on every load — it is local and free.
- An `llm` step runs only when its input hash changed, or on the first run, or on a manual refresh. This is the single most important cost control in the product.
- `transform` always runs locally.
- Switching views re-renders the same data locally; it never re-extracts or re-calls the model.

## Deliver

The result lands, and it is attributed to the tool that produced it. This is the step the loop used to skip: the product narrative was "a tool was built", while what the user actually wanted was "I have the data".

- Owned by: `packages/capabilities/render` (the result), `packages/capabilities/export` (copy / CSV / JSON), `packages/ui` (attribution header, promise line).
- Why it matters: first-run satisfaction comes from **data in hand**, not from "a tool exists". The tool is the by-product, and it is advertised on the result itself — so the user learns, without being taught, that something was saved and will come back.
- Discipline: do not explain what a Tool is, do not interrupt, and never ask the user to decide whether to keep it. The result carries one line of provenance and one line of promise, nothing more.
- Appear intensity is **not graded in V1**: a matching tool pulses once on load, and the overview list is ordered by most recent use. Deleting a tool is the only exit — always user-initiated, always confirmed twice, and it removes the tool completely. The Active / Quiet / Archived grading is not in V1: there is no 30-day usage history to grade against.

## Health

After each run, a minimal summary is recorded — whether there was data, how many items, and a shape digest per field. Full result data is never kept; the summary is enough to detect pattern drift.

| Status | Meaning | Presentation |
|---|---|---|
| `healthy` | matches the historical pattern | nothing shown |
| `degraded` | ran, but the result pattern deviates | a small corner marker, no interruption |
| `broken` | execution failed or the target is gone | error state with a short explanation and a CTA |

The promise is not "tools never break". It is "breakage is detected, explained, and cheap to fix".

## Repair

A broken or user-initiated repair re-enters the **build** flow with a prefilled context message — *"this tool has been returning empty results; the page may have changed"* — so the user is never dropped into an empty input box.

Two failures end the attempt with concrete advice (narrow the scope, rephrase, or accept that the page is too complex). There is no silent background repair and no infinite retry.

## Version

A repair or edit **always** creates a new version. Old versions are never deleted and can be rolled back; versions that were ever broken are marked. Versioning is what makes repair safe to attempt.

## Reuse

The point of the whole loop. A tool that reappears on its page, weeks later, without the user re-describing anything.
