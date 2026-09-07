# Code Map

Where things live, what each module owns, and what it is forbidden to do. This is a navigation aid: the authoritative type contracts and interfaces are in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Layering (dependencies point downward only)

```text
Tool DSL (packages/dsl)
   ↓
Capability Runtime (packages/runtime + capabilities + health + repair)
   ↓
Browser Adapter (packages/browser — the only package that wraps chrome.*; entrypoint exception in §6.4.1)
   ↓
Browser APIs (DOM / chrome.storage / chrome.tabs / fetch / clipboard / downloads)
```

A dependency that jumps a layer upward, or sideways into another package's internals, is a bug even if it compiles.

## Packages

| Package | Owns | Key exports | Must not |
|---|---|---|---|
| `packages/core` | domain models, cross-context message protocol | `ToolRecord`, `HealthStatus`, `ExtensionMessage` | contain runtime logic (types only) |
| `packages/dsl` | DSL types, schema validation, URL matching | `validateToolDefinition`, `matchUrl`, `parseUrlPattern` | import `chrome.*`, touch the DOM |
| `packages/runtime` | step orchestration, variable bag, llm cache decision, capability registry | `ToolRuntime`, `CapabilityRegistry` | call platform APIs directly; produce side effects except through injected ports |
| `packages/capabilities` | the five executors | `CapabilityDefinition` implementations | bypass the registry, silently swallow failures |
| `packages/browser` | `BrowserAdapter` interface, chrome implementation, mock | `BrowserAdapter` | be bypassed by anyone (the entrypoint assembly layer is the sole exception, §6.4.1) |
| `packages/analyzer` | page analysis (visible text, structure, custom elements, shadow DOM) | `analyzePage` | mutate the page, call the model |
| `packages/health` | health evaluation and state machine | `evaluateHealth` | write to storage (results are written by the caller) |
| `packages/repair` | repair session, version creation, rollback | `RepairSession` | auto-apply a repaired tool without user confirmation |
| `packages/storage` | `chrome.storage` wrapper, migrations | `loadTool`, `saveTool`, … | be used outside the background gateway path |
| `packages/llm` | BYOK client, prompt templates, injection defence, `run:llm` background handler | `callLlm`, `buildPrompt`, `handleRunLlm`, `createMockLlmPort` | execute outside the background context; log prompts containing keys |
| `packages/ui` | React UI, Shadow DOM isolation, tokens | components | hard-code colour values; import icon libraries ad hoc |
| `apps/extension` | WXT entry assembly and manifest | — | hold business logic |
| `apps/playground` | Web Corpus static server + benchmark runner | — | ship with the extension |

**State:** every directory above exists. `core`, `dsl` and `ui` carry code (stages 0-3 and
1-1), and stages 1-2 / 1-3 filled `analyzer`, `browser` and `storage`; the rest hold a
placeholder entry naming the stage that will fill them. The
*Owns* column is a contract about code that may not exist yet — read it as the reason the
directory is reserved, and check [`ARCHITECTURE.md` §4](ARCHITECTURE.md) before putting
anything new in one of them.

## "I want to…" index

| I want to… | Go to |
|---|---|
| change what a tool definition looks like | `packages/dsl` + [`ARCHITECTURE.md` §5](ARCHITECTURE.md) |
| add a transform operation | `packages/capabilities/transform` + `TransformOp` enum |
| add a new view | `packages/capabilities/render` + `RenderStep.view` |
| change how a page is understood | `packages/analyzer` |
| change how values are read off a page | `packages/capabilities/extract` + [`ARCHITECTURE.md` §5.2](ARCHITECTURE.md) |
| change when the model is called | `packages/runtime` (hash comparison) |
| change failure detection | `packages/health` + [`ARCHITECTURE.md` §10](ARCHITECTURE.md) |
| change repair / versioning | `packages/repair` |
| change any browser API usage | `packages/browser` (nowhere else) |
| change colours, spacing, motion | `packages/ui/tokens.css`, values from [`UI_SPEC.md`](UI_SPEC.md) |
| add a message between contexts | `packages/core` protocol + [`ARCHITECTURE.md` §7.2](ARCHITECTURE.md) |
| add an export format | `packages/capabilities/export` + `ExportStep.format` |
| change user-facing copy | `packages/ui/src/copy/` (language rules: [`UI_SPEC.md` §9.5](UI_SPEC.md)) |
| add a benchmark case | `tests/benchmark` (from stage 2-1) + [`contributing/BENCHMARK_GUIDE.md`](contributing/BENCHMARK_GUIDE.md) |
| change what the extension is allowed to do | `apps/extension/manifest.ts` + [`ARCHITECTURE.md` §7.3](ARCHITECTURE.md) — the permission snapshot test fails on any change |
| change the global shortcut | `apps/extension/manifest.ts` (`commands`). Chrome spells the Mac modifier `Command`, not `Cmd`, and rejects the manifest otherwise |
| add a log category | `packages/core/src/logger.ts` + [`CONVENTIONS.md` §12](CONVENTIONS.md) |
| understand why a package is empty | `ARCHITECTURE.md` §4, then the stage that owns it in [`ROADMAP.md`](ROADMAP.md) |

## Invariants worth protecting

These are the ones a well-meaning refactor breaks first:

1. **No dynamic code.** No `eval`, no `new Function`, no remote code loading, anywhere.
2. **`chrome.*` is wrapped only in `packages/browser`.** Everything else depends on the `BrowserAdapter` interface; tests use the mock. The single exception is the entrypoint assembly layer, which may use four enumerated registration calls in `background.ts` (`ARCHITECTURE` §6.4.1).
3. **The model emits configuration, never code.** The DSL has no control flow: `if / else / for / while / map` are not options. Rising complexity means a new, semantically named capability.
4. **The API key stays in the background.** It never enters the content script, the page context, or logs.
5. **Page content is data, not instructions.** In every `llm` prompt it is wrapped as a data section.
6. **Validate twice.** Before save and before execution; unknown fields or unknown `type` are rejected.
7. **Repair always produces a new version.** Old versions are kept and can be rolled back; silent auto-repair is forbidden.

## Where to add a new file

- A file belongs to the package that owns its concept, not to the nearest convenient folder.
- There is no general `utils/` or `helpers/` for business logic. If a helper is genuinely cross-package, it belongs in `packages/core` as a typed, tested function.
- Keep files around 200 lines and functions around 30 lines. These are maintainability signals, not mechanical limits — if you exceed them, check whether a responsibility wants to split out, and say why if you decide not to.
