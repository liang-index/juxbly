# Juxbly Engineering Conventions v1

> The current engineering execution standard for Juxbly.
>
> This document is the engineering companion to the product baseline and answers: **how to develop, how to organize code, how to make AI Agents work, how to test, and how to help open-source contributors understand and extend Juxbly.**
>
> Product definition, business strategy, and major architecture decisions remain governed by the product baseline as the upper-level source of truth; this document must not change the product baseline on its own.


>
> **Placement**: Phase 0 documentation stack placement is complete. This document lives at `docs/CONVENTIONS.md` (formerly `Juxbly_Engineering_Conventions_v1.md`) and is the single source of truth for engineering conventions; see `docs/README.md` for documentation stack navigation. Type contracts referenced here follow `docs/ARCHITECTURE.md`; UI rules follow `docs/UI_SPEC.md`.

---

# 1. Engineering Goals

Juxbly's engineering system must serve three audiences at once:

1. **Maintainer**: able to keep architecture, quality, and security under control over the long term.
2. **AI Coding Agent**: able to implement efficiently within clearly defined context and boundaries.
3. **OSS Contributor**: able to understand, run, modify, extend, and contribute to Juxbly without first understanding the entire codebase.

Juxbly's engineering quality is therefore not just "the code runs". It also includes:

> **Understandable, testable, extensible, reviewable, revertible, contributable.**

---

# 2. Working Roles

| Role | Responsibility in Juxbly |
|---|---|
| Maintainer / Project Leader | Product direction, architecture decisions, priorities, final acceptance, Merge, Release |
| AI Coding Agent | Implement the current task, test, self-review, produce change reports |
| AI Reviewer | Architecture review, code review, debugging, documentation consistency checks |
| OSS Contributor | Documentation, tests, benchmarks, recipes, capabilities, bug fixes, etc. |

## 2.1 Core Rules

- AI Agents may implement, but must not change product direction on their own.
- Unconfirmed architecture changes must be reported first.
- Core architecture, security, the DSL, and Capability Policy belong to the Maintainer control path.
- AI-generated code is held to the same quality standard as human-written code.
- The main branch is protected; AI Agents do not commit unreviewed code directly to it.

---

# 3. Juxbly's Engineering Layers

Juxbly's core technical structure:

```text
                    Tool DSL
                       ↓
              Capability Runtime
                       ↓
                Browser Adapter
                       ↓
                Browser APIs
```

Surrounding core systems:

```text
Page Analyzer
Tool Health
Repair
Versioning
Storage
UI
Benchmark
```

## 3.1 Core Responsibilities

### Tool DSL

Describes:

> **What the user wants the Tool to do.**

It must not describe browser-level implementation directly.

### Capability Runtime

Responsible for:

- Capability registration
- Schema validation
- Dispatch
- Input/output contracts
- Permission information
- Execution lifecycle

### Browser Adapter

Responsible for mapping abstract capabilities to Chrome or other browser implementations.

The DSL does not depend on `chrome.*` APIs directly.

### Page Analyzer

Responsible for:

- Page structure analysis
- Visible text
- Attribute information
- Web Components
- Shadow DOM
- Structural features
- Selector candidates

### Tool Health

Responsible for:

- Execution Health
- Result Health
- Structure Fingerprint
- Semantic Health

### Repair

Responsible for:

```text
Detect
 ↓
Explain
 ↓
Edit / Repair
 ↓
Highlight Confirm
 ↓
Save New Version
```

---

# 4. Capability Architecture

This is the foundation of Juxbly's long-term extensibility.

## 4.1 The Four Capability Categories

### Observe

Examples:

- extract
- inspect
- read
- screenshot
- observe

### Transform

Examples:

- filter
- sort
- dedupe
- parse
- transform
- llm

### Act

Candidates for the future:

- click
- input
- scroll
- select
- clipboard
- download

### Orchestrate

Candidates for the future:

- wait
- condition
- loop
- navigate
- tab
- schedule

## 4.2 V1 Principles

V1 primarily implements:

```text
Observe + Transform + LLM + Render + Export
```

Action / Orchestration remain architectural reservations only; the current V1 scope is not expanded just because "it could be done in the future".

## 4.3 RPA Boundary

Juxbly can gradually acquire Browser Action / Lightweight RPA capabilities, but:

> **Juxbly is not a traditional RPA platform and does not offer a Workflow-Designer-first product experience.**

A new Action must first prove its clear value to the Persistent Tool.

---

# 5. Capability Registry Specification

Every Capability must have a clearly defined:

```ts
interface CapabilityDefinition {
  type: string
  version: string
  inputSchema: unknown
  outputSchema: unknown
  permissions: string[]
  execute: unknown
}
```

The authoritative interface is the formal type definition in `ARCHITECTURE.md`; the example above exists only to convey the concept.

Each Capability requires at minimum:

1. Implementation
2. Input Schema
3. Output Schema
4. Permission Requirements
5. Security Notes
6. Tests
7. Documentation
8. Benchmark / Fixture (where applicable)

### Prohibited Practices

- Do not scatter `chrome.*` API calls directly into the DSL.
- Do not bypass Runtime permission and validation through a Capability.
- Do not write unexplainable global side effects for a single site.
- Do not introduce arbitrary dynamic JavaScript execution directly.

---

# 6. Tool DSL Specification

The current Tool DSL is designed to evolve.

V1 may include:

```text
extract
transform
llm
render
export
```

The Schema may later add:

```text
triggers
context
state
outputs
actions
orchestration
```

But backward compatibility must be preserved:

> **Adding a new Capability must not require rewriting existing Tools.**

## 6.1 DSL Principles

### Express intent, not the underlying API

Recommended:

```json
{
  "type": "extract",
  "target": "products",
  "fields": ["title", "price"]
}
```

It is not recommended to expose the following

```text
querySelectorAll
addEventListener
chrome.scripting.executeScript
```

directly to the DSL.

### Do not create a "JavaScript replacement language"

If complexity keeps growing, prefer adding a semantically clear Capability rather than continually adding:

- if
- else
- for
- while
- map
- eval
- arbitrary code

---

# 7. Code Structure

> For the product-level conclusion on directory semantic boundaries, see the product baseline §10.6.2; in case of conflict the product baseline prevails. This document retains the engineering execution rules.

The repository should adopt a structure that maps directly onto Juxbly concepts:

```text
juxbly/
│
├── apps/
│   ├── extension/
│   └── playground/
│
├── packages/
│   ├── core/
│   ├── dsl/
│   ├── runtime/
│   ├── capabilities/
│   ├── browser/
│   ├── analyzer/
│   ├── health/
│   ├── repair/
│   └── ui/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── benchmark/
│   └── fixtures/
│
├── docs/
│   ├── concepts/
│   ├── architecture/
│   ├── capabilities/
│   ├── benchmark/
│   ├── recipes/
│
├── scripts/
│
├── README.md
├── ARCHITECTURE.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── LICENSE
└── package.json
```

The final layout follows the actual implementation, but it must satisfy:

> **A developer unfamiliar with the project can infer system responsibilities from directory names alone.**

Do not let an oversized `utils/`, `helpers/`, or `misc/` directory without clear boundaries become a dumping ground for core business code.

### 7.1 Workspace-internal dependencies

A `package.json` declares **external** dependencies only. One package reaching another `@juxbly/*` package is resolved through `compilerOptions.paths` (`tsconfig.base.json`) plus the matching alias in `vitest.config.ts` and `apps/extension/wxt.config.ts` — not through `pnpm`.

Why not `workspace:*`: `packages/core` and `packages/browser` import types from each other — `RuntimePorts` reuses the browser port shapes, and the adapter carries the §7.2 message types. Declaring both directions would make the workspace graph cyclic for a dependency that is erased at compile time anyway.

The consequence to keep in mind: `package.json` does not show the internal graph. The authoritative statement of it is `docs/ARCHITECTURE.md` §4, mirrored in `docs/CODE_MAP.md`; a new package must be registered in **all three** alias sources, or it will resolve in one runner and fail in another.

---

# 8. Code Size and Module Boundaries

Default signals:

- Keep a single file to roughly 200 lines or fewer
- Keep a single function to roughly 30 lines or fewer
- One module, one primary responsibility
- When the number of public APIs grows too large, check whether the responsibility has become too broad

Exceptions are allowed but must be justified.

### Juxbly-Specific Requirements

The following modules should be especially protected against bloat:

- Runtime
- Analyzer
- Health
- Repair
- Browser Adapter
- UI root

Complex logic should be split into independently testable components.

---

# 9. TypeScript Rules

- `strict: true`
- `any` is forbidden by default
- Prefer `unknown` plus a type guard
- `@ts-ignore` is forbidden
- Use `@ts-expect-error` only when necessary, and state the reason
- Public APIs declare explicit return types
- `interface` for stable object contracts
- `type` for unions / composition / derived types
- Type definitions must not be duplicated across documents/modules

---

# 10. Naming Conventions

| Object | Convention |
|---|---|
| Files | `kebab-case` |
| Folders | `kebab-case` |
| Classes | `PascalCase` |
| Functions/variables | `camelCase` |
| Constants | `SCREAMING_SNAKE_CASE` |
| Capability type | stable, semantic, lowercase string |
| Tests | named to correspond with the source file |
| CSS class | `juxbly-` prefix + `kebab-case` |

Once a Capability name enters the public DSL, renames must be handled with care and account for version compatibility.

---

# 11. Comment Conventions

> For the product-level conclusion on comment principles, see the product baseline §10.6.3; this document retains the engineering execution details.

Principle:

> **Code explains How. Comments explain Why.**

## 11.1 When a Comment Is Required

- Product constraints
- Architecture invariants
- Security boundaries
- Special Browser API behavior
- DOM / Shadow DOM compatibility
- Conservative policies in Health / Repair
- Why there is no automatic repair
- Why a capability is disabled in the Store Build
- Temporary workarounds

## 11.2 No Valueless Comments

```ts
// Loop through items
for (const item of items) {
```

This kind of comment has no value.

## 11.3 Recommended Architecture-Protection Comments

```ts
// Do not auto-apply repaired selectors here.
// V1 requires user confirmation before creating a new Tool version.
```

This protects product invariants and helps future AI Agents understand "why this must not be casually optimized here".

## 11.4 Language

- Code / comments / JSDoc: English
- User communication: depends on the collaboration environment
- GitHub-facing docs: English is the default target language; a Chinese supplement may be provided when necessary

---

# 12. Logging / Debugging

Use the logger consistently.

Recommended logical categories:

```text
[JUXBLY][BUILD]
[JUXBLY][RUNTIME]
[JUXBLY][CAPABILITY]
[JUXBLY][HEALTH]
[JUXBLY][REPAIR]
[JUXBLY][SECURITY]
```

Logging is forbidden for:

- API Key
- Token
- Full sensitive page content
- User credentials

## 12.1 Debug-first Principle

Open-source users must be able to answer:

> **Why did this Tool not work as expected?**

Debug / Inspect capabilities are therefore first-class citizens, not internal-development-only features.

It should be possible to observe:

```text
Tool
 ↓
Trigger / Context
 ↓
Capability
 ↓
Input
 ↓
Execution
 ↓
Output
 ↓
Health
 ↓
Failure / Repair
```

---

# 13. UI / Prototype Conventions

Juxbly is a high-UX-density product.

New pages, core flows, and complex states should come with an interactive HTML Prototype before implementation.

A Prototype should be able to express:

- Browser page background
- Juxbly floating ball entry
- Overlay / panel
- Highlight state
- Build state
- Tool result
- Health / Repair state
- Tool Identity

The Prototype is responsible for:

> Visual and interaction expression.

`UI_SPEC.md` is responsible for:

> Rules, tokens, boundaries, and component behavior.

When the two conflict, the finally confirmed product decision prevails, and the single source of truth is updated in sync.

---

# 14. Tool Identity UI

A Juxbly Tool uses:

```text
Juxbly Brand Icon
+
Tool Category Color
+
Tool Name
+
Short Description / Tooltip
```

Color expresses the Category, not one specific function.

V1 has 4 stable categories (`Monitor` was removed — V1 has no scheduled / background execution capability,
so no Tool can belong to that category, see `ARCHITECTURE.md` §5.1; it returns as a pure addition when V2 monitoring capabilities land):

```text
Data
Enhance
Analyze
Export
```

Final color values are consolidated in `UI_SPEC.md`.

Color must never be the only means of identification.

---

# 15. Tool Health / Repair Engineering Rules

The four Health layers:

1. Execution
2. Result
3. Structure Fingerprint
4. Semantic

States:

```text
Healthy
Degraded
Broken
```

V1 Repair:

```text
Detect
 ↓
Explain
 ↓
Edit / Repair
 ↓
Highlight Confirm
 ↓
Save New Version
```

Forbidden:

> **Silently modifying a user's Tool in the background in V1.**

Repair Candidates may be added in the future, but must pass benchmark and security validation.

---

# 16. Local Web Benchmark

Juxbly's core development cannot rely on "opening a few websites and eyeballing them".

The following must be built up step by step:

```text
Web Corpus
+
Task Corpus
+
Ground Truth
+
Regression Runner
```

Each test case should record:

- site
- task
- expected result
- actual result
- ground truth
- semantic evaluation
- Correct / Partial / Wrong
- latency
- token / model cost (where applicable)
- health result
- repair result (where applicable)

Any change affecting the following modules should be followed by a regression run:

- Analyzer
- Selector logic
- DSL
- Runtime
- Capability
- Semantic validation
- Health
- Repair

---

# 17. Benchmark Contribution

> For the product-level conclusion on contribution paths (the layering and threshold strategy for Documentation / Benchmark / Recipe / Capability), see the product baseline §10.6.5–10.6.7; §17–§19 of this document retain the concrete engineering rules.

A Benchmark Case is a first-class form of open-source contribution.

Contributors may submit:

```text
benchmark case
├── site / fixture
├── task
├── expected result
├── ground truth
├── notes
└── reproduction steps
```

Contributors are not required to modify core code.

This is also one of the contribution paths best suited to early community participation.

---

# 18. Recipe Contribution

A Recipe is the shareable form of a user-created Tool definition.

A Recipe contains at minimum:

```text
recipe.json
README.md
```

Optional:

```text
screenshot
benchmark
fixtures
```

Recipes must be sanitized.

Never submit:

- API keys
- Cookies
- Session tokens
- User personal data
- Sensitive account information

---

# 19. Capability Contribution

When contributing a new Capability, you must state:

1. Purpose
2. Why it belongs in Juxbly
3. Input
4. Output
5. Permission
6. Security Risk
7. Runtime integration
8. Browser adapter integration
9. Tests
10. Benchmark / examples
11. Limitations

Standard process:

```text
Issue / Proposal
 ↓
Capability Design
 ↓
Implementation
 ↓
Tests
 ↓
Benchmark
 ↓
Security Review
 ↓
PR
 ↓
Maintainer Review
```

---

# 22. Code Review

Reviewers check at minimum:

### Architecture

- Are module boundaries respected?
- Is the Capability Runtime bypassed?
- Are Browser APIs directly coupled?
- Is the DSL's ability to evolve broken?

### Security

- Is dynamic code execution introduced?
- Are permissions expanded?
- Is there an untrusted input → execution path?
- Is there a Prompt Injection risk?

### Tool Lifecycle

- Does it affect Save / Version / Health / Repair?
- Is cleanup handled correctly?

### Code Quality

- TypeScript strict
- No unnecessary `any`
- Comments explain Why
- Clear module responsibilities

### Testing

- Unit tests
- Integration tests
- Benchmark / Regression

---

# 23. Git / Branch / Release

Recommended flow:

```text
Issue
 ↓
feature/* or fix/* branch
 ↓
Implementation
 ↓
Test / Benchmark
 ↓
PR
 ↓
Review
 ↓
Merge
 ↓
Release
```

Releases must use an explicit version number.

Release Notes must state at minimum:

- Added
- Changed
- Fixed
- Breaking Changes (if any)
- Security Notes (if any)

---

# 24. Open Source / Store Build Boundary

The capability ceiling of Juxbly Core is not determined by the CWS.

```text
Juxbly Core
    ↓
Capability Runtime
    ↓
Policy Surface
 ┌───────────────┐
 ↓               ↓
Open Source    Store Build
Full Surface   Safe / Compliant Surface
```

## Open Source Build

Goals:

- Maximize the capability ceiling
- Developer-debuggable
- Extensible
- Open to experimentation

## Store Build

Goals:

- CWS compliance
- Minimal permissions
- Safe for ordinary users
- Explainable
- Maintainable

Do not reverse-restrict Core's long-term capability ceiling for the sake of the Store Build.

But every high-risk Open Source capability must also have:

- Explicit permissions
- Risk disclosure
- User confirmation
- Security boundaries

---

# 25. Open Source Security Baseline

The following must be in place:

- Secret scanning / push protection
- Dependency alerts
- Code scanning
- Security contact
- Dependency review

Juxbly additionally watches for:

- Prompt Injection
- Page content as untrusted input
- API key leakage
- Malicious content in Tool Recipes
- Capability privilege escalation
- Custom script / dynamic code capabilities
- Browser API overreach

---

# 26. OSS Developer Experience Acceptance Criteria

Juxbly's open-source engineering experience should meet at least the following:

### Understand

- The README explains the product and core concepts.
- ARCHITECTURE explains the system structure.
- The Code Map tells contributors where to look.

### Run

- Clear local installation / development commands exist.
- A new developer can get it running for the first time within a reasonable amount of time.

### Modify

- Module responsibilities are clear.
- Types and interfaces are clear.
- Conventions are explicit.

### Extend

- A Capability Contribution Guide exists.
- A Benchmark Contribution Guide exists.
- A Recipe Contribution Guide exists.

### Contribute

- Issue templates are clear.
- PR requirements are clear.
- Testing requirements are clear.
- Security boundaries are clear.

Core metrics:

> **Developer Time to First Success**
>
> **Developer Time to First Contribution**

---

# 27. Juxbly-Specific Engineering Pitfalls

| Pitfall | Handling Principle |
|---|---|
| Hard-coding V1 capabilities into the DSL | The DSL must remain evolvable |
| DSL calls Chrome APIs directly | Go through the Browser Adapter |
| Arbitrary JS execution | Forbidden by default |
| Silent Repair modifications | Forbidden in V1 |
| Detecting a broken Tool from DOM mutation alone | Use structural + result + semantic Health |
| AI expands scope on its own | Task scope + Do Not Implement |
| Testing websites but not tasks | Web Corpus + Task Corpus |
| Testing only the first Build | Save / Run / Health / Repair must all be tested |
| CWS constraints reverse-limiting the OSS Core | Policy Surface separation |
| Capability without a permission statement | The Capability contract must include permission |
| Recipe leaking credentials | Sanitization and security checks |
| AI Agent committing to the main branch directly | Branch + Review |

---

# 28. Single Source of Truth for Documentation

Juxbly's documentation layering:

```text
Product baseline
        ↓
Product / Architecture
        ↓
Engineering Conventions
        ↓
Code
        ↓
Tests / Benchmark
```

Principle:

> **Do not let different documents each "redefine" the same fact.**

When a conflict is found:

1. Identify the latest confirmed conclusion.
2. Mark it as a Change.
3. Update all affected documents.
4. Search for old terminology and old architecture.
5. Re-run the relevant tests / benchmarks.

---

# 29. Juxbly's Engineering Decision Framework

When a new capability or technical approach comes up, evaluate it in this order:

1. **Product Fit**: Does it strengthen the Persistent Tool?
2. **User Value**: Does it reduce user cognitive / operational cost?
3. **Architecture Fit**: Does it fit the DSL / Capability / Runtime / Adapter layering?
4. **Security**: Are permission and execution risks controllable?
5. **Testability**: Can repeatable tests be built?
6. **OSS Value**: Does it improve the extensibility of or participation in the open-source project?
7. **Store Surface**: Can it later be converged through the Policy Surface?
8. **Scope**: Is it truly needed in the current version?

Final output:

> Do it / Don't do it / Do it with adjustments / Pending validation

---

# 30. Overarching Execution Principles

Juxbly's engineering culture can be summarized as:

> **AI Agents write implementations, Maintainers control direction; the DSL describes intent, the Runtime controls execution; Core sets the capability ceiling, Policy sets the release boundary; benchmarks prove reliability, documentation guarantees traceability, and open-source DX guarantees the community can participate.**
