# Document Change Protocol

Any change to architecture, product conclusions, types, naming, or core rules goes through these seven steps. The failure mode this prevents is the most common one in a documentation-heavy project: two documents quietly defining the same fact differently.

## Step 1 — Scan for impact

Before editing, search globally for the concept, its old name, and its references.

```bash
rg -n "conceptName|oldName" --glob '!node_modules'
```

Include `docs/`, `README.md`, `CONTRIBUTING.md`, `packages/`, and `apps/`. A rename in prose that misses one reference leaves a trap for the next contributor.

## Step 2 — Make the change

Edit file by file. For each file record:

- what changed
- why it changed

Do not batch unrelated fixes into the same change — a doc change should be reviewable on its own.

## Step 3 — Verify consistency

- Re-read every modified file.
- Search for the old term; a partial rename is worse than no rename.
- Check cross-document references still resolve (links, section numbers, "see §X" pointers).

## Step 4 — Verify structure

For type or protocol changes, additionally check:

- Does each new field have a lifecycle (who writes it, who reads it, what happens when it is missing)?
- Are enums synchronised everywhere they appear (DSL union, validator, capability registry, UI, docs)?
- Are dependents updated (schemas, tests, fixtures, tasks)?
- **Is the new or changed contract written back to `docs/ARCHITECTURE.md`?** That document is the single source of truth for types and interfaces. A type marked for write-back to it must also have a matching entry in that stage's Acceptance Criteria — otherwise the obligation exists only as a sentence nobody checks.

## Step 5 — Check internal consistency

One concept must not have two definitions in one project. If a new document needs to say something already defined elsewhere, **link** to it. Duplicated definitions rot at different speeds.

Authoritative sources:

| Fact | Source |
|---|---|
| Types, interfaces, protocol | [`../docs/ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Engineering conventions | [`../docs/CONVENTIONS.md`](../CONVENTIONS.md) |
| UI tokens and component rules | [`../docs/UI_SPEC.md`](../UI_SPEC.md) |
| How an interaction looks | [`../docs/UI_SPEC.md`](../UI_SPEC.md) — it owns appearance and behaviour. The interactive prototype is an internal review tool, not an authority |

## Step 6 — Output a change report

State: files changed, what changed in each, why, and the verification result (searches run, checks performed, tests or benchmarks re-run).

## Step 7 — Developer-view completeness check

For every affected area, instantiate the five meta-rules and report **pass ✅ / fail ❌ + reason**. All five must pass for the change to count as complete.

| Rule | Question to answer for the affected task |
|---|---|
| **M1 Traceability** | Can you follow decision → architecture → code → test without a gap? |
| **M2 Lifecycle closure** | Does every affected entity/state have a defined create / read / update / delete (or explicit persistence) responsibility? |
| **M3 Mapping completeness** | Are enums, categories, capabilities, and states free of orphan values (a value nothing produces, or nothing consumes)? |
| **M4 Side-effect derivability** | For each state change, are the downstream effects on cache, UI, events, and persistence explicit? |
| **M5 Template consistency** | Do the touched documents still follow the same structure as their peers? |

## Practical notes

- Ordering changes (what gets built first) are planning edits, not contract changes; they do not need this protocol.
- **Definitions and entry conditions are contract changes**: if you change what a state means, change it everywhere it is defined and tested, in the same pull request.
- When code and docs disagree, resolve it. Do not ship a knowingly stale document — the next reader will trust it.
