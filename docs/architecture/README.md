# Architecture Deep Dives

[`../ARCHITECTURE.md`](../ARCHITECTURE.md) is the single source of truth for type contracts and module interfaces. This folder holds **deep dives** — longer explanations of a subsystem that would bloat the main document.

## Rules

1. A deep dive **extends**, never redefines. If it needs to state a type, it links to `ARCHITECTURE.md`.
2. A deep dive owns exactly one subsystem. Cross-cutting material belongs in [`../concepts/`](../concepts/README.md).
3. When a deep dive and `ARCHITECTURE.md` disagree, `ARCHITECTURE.md` is updated first, then the deep dive. Never leave both standing.
4. Adding a deep dive requires the [document change protocol](../contributing/DOC_CHANGE_PROTOCOL.md).

## Planned

| Document | Subsystem | Appears with stage |
|---|---|---|
| `capability-runtime.md` | registry, execution lifecycle, port injection, abort semantics | 1-3 / 1-4 |
| `messaging.md` | cross-context message protocol, request correlation, error propagation | 1-6 |
| `storage-and-migrations.md` | storage keys, migration policy, quota behaviour | 1-3 |
| `prompt-and-injection-defence.md` | prompt construction, data-section wrapping, what is logged | 1-6 |
| `health-internals.md` | execution and result layers, the structure-fingerprint interface | 1-11 |
| `policy-surface.md` | how the Store Build converges permissions from the same core | 3-2 |

Until a deep dive exists, its subject is covered by the corresponding section of `ARCHITECTURE.md` — there is no gap, only less depth.
