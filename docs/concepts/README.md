# Concepts

Explanations for people who want to understand *why* Juxbly is built this way, without reading the type contracts first.

| Concept | Document |
|---|---|
| The Tool and its lifecycle (Build → Confirm → Save → Run → Health → Repair → Version) | [`tool-lifecycle.md`](tool-lifecycle.md) |

Planned as the corresponding stages land: the DSL as intent (not API), capability permissions, the Policy Surface (Open Source Build vs Store Build), and structure fingerprints.

## Rule for this folder

Concept docs **explain**; they never redefine. Types, interfaces, and protocol live in [`../ARCHITECTURE.md`](../ARCHITECTURE.md); tokens and component rules live in [`../UI_SPEC.md`](../UI_SPEC.md). If a concept document finds itself restating a type, it should link instead — otherwise the two copies drift apart, and the drift is invisible until something breaks.
