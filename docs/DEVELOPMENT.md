# Development

Getting a working local environment. Target: a new contributor goes from `git clone` to a tool running on a real page without guessing.

> **Status:** the extension skeleton builds and loads; features land incrementally. Anything that needs page analysis, a tool, or a model call is not built yet — see [`contributing/SCOPE.md`](contributing/SCOPE.md).

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 LTS | WXT / Vite requirement |
| pnpm | ≥ 9 | workspace package manager (`corepack enable` is the easiest install) |
| Chrome | recent stable | Manifest V3, desktop only |
| An OpenAI-compatible API key | — | BYOK. Only needed the first time a tool actually needs an `llm` step |

## First success

```bash
git clone https://github.com/liang-index/juxbly_oss.git
cd juxbly_oss
pnpm install
```

```bash
pnpm dev
```

WXT builds to `.output/chrome-mv3`. Load it once:

1. `chrome://extensions`
2. enable **Developer mode**
3. **Load unpacked** → `.output/chrome-mv3`

`pnpm dev` rebuilds content scripts without a full extension reload; the background service worker still needs the reload button in `chrome://extensions` after changes.

At stage 0-3 the extension loads with a placeholder popup and an empty options page. The walkthrough below needs the floating ball, which arrives in stage 1-8 — until then, a successful load means: no manifest errors, the popup opens, and `div#juxbly-root` exists (hidden) on any page.

Then open any page with repeating structure (Hacker News is a good first target), click the floating ball, and type something like *"collect the title, points and comment count of each post"*. Confirm the highlight. Reload the page — the tool should be there again.

## Commands

| Command | Purpose |
|---|---|
| `pnpm install` | install workspace dependencies |
| `pnpm dev` | watch build (extension target) |
| `pnpm build` | production build |
| `pnpm typecheck` | `tsc --noEmit` across packages |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pnpm test` | Vitest unit + integration |
| `pnpm test:bench` | local web benchmark (from stage 2-3) |

## Repository layout

```text
apps/
  extension/     WXT entry points: background, content script, popup, options
  playground/    static server for the Web Corpus + benchmark runner (Phase 2)
packages/
  core/          domain models and cross-context message protocol (types only)
  dsl/           Tool DSL types, schema validation, url_pattern matching
  runtime/       step orchestration, variable bag, llm cache decision, registry
  capabilities/  extract / transform / llm / render / export executors
  browser/       BrowserAdapter + chrome implementation + mock (the only package that wraps chrome.*)
  analyzer/      page analysis: visible text, structure, custom elements, shadow DOM
  health/        health evaluation and state machine
  repair/        repair session, version creation and rollback
  ui/            React UI: floating ball, panels, highlight layer, popup, options
  storage/       chrome.storage wrapper and migrations
  llm/           BYOK client, prompt templates, injection defence
tests/
  unit/ integration/ benchmark/ fixtures/
```

Module responsibilities, dependencies, and forbidden responsibilities: [`ARCHITECTURE.md` §4](ARCHITECTURE.md) and [`CODE_MAP.md`](CODE_MAP.md).

## Debugging

Because Juxbly is an extension, "where does this log come from" matters:

| Context | How to inspect | Log tag |
|---|---|---|
| Background service worker | `chrome://extensions` → *service worker* link | `[JUXBLY][BUILD]`, `[JUXBLY][SECURITY]` |
| Content script | the page's own DevTools console | `[JUXBLY][RUNTIME]`, `[JUXBLY][CAPABILITY]` |
| Popup / options | right-click inside the panel → *Inspect* | `[JUXBLY][STORAGE]` |

Rules that keep debugging sane:

- Use the shared logger; do not scatter `console.log` through business code.
- Every log line carries a `[JUXBLY][*]` tag so it can be filtered out of a noisy page console.
- **Never** log API keys, tokens, page content, or extracted user data. If you need to inspect an LLM payload, log its shape and hash, not its contents.
- High-frequency callbacks must not log.

The open-source build also ships an **Inspect** tab in the run panel showing each step's input, output, and duration — usable during build, before the first run (stage 1-9, [`UI_SPEC.md` §10](UI_SPEC.md)).

## Testing

```bash
pnpm test                  # everything that does not need Chrome
pnpm test -- --watch
pnpm test path/to/file     # single file
```

Integration tests drive the real `ToolRuntime` against fixture HTML with a **mock `BrowserAdapter`** and a **mock `LlmPort`**. No Chrome, no network, no key. Test scope, layers, and the regression trigger rule: [`testing/TESTING.md`](testing/TESTING.md).

## Before you open a PR

```bash
pnpm typecheck
pnpm lint
pnpm test
```

If your change touches `packages/dsl`, `packages/runtime`, `packages/capabilities`, `packages/health`, `packages/analyzer`, or `packages/repair`, also run `pnpm test:bench` and report the delta.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Content script changes do not appear | WXT hot reload covers content scripts; reload the extension for background changes |
| `chrome.runtime` is undefined | code ran outside an extension context — platform access must go through `packages/browser` (the entrypoint assembly layer is the only exception, [`ARCHITECTURE.md` §6.4.1](ARCHITECTURE.md)) |
| The floating ball never appears | check the content script is injected on that origin, and that the ball is not disabled in options |
| Stale tools after a schema change | storage migrations live in `packages/storage`; bump the migration, do not delete the key |
| Nothing happens on model calls | the key lives in the background context; check the service worker console, not the page console |

## Contributor workflow

```text
Issue → branch (feature/* or fix/*) → implement → tests → benchmark (if shared core) → PR → maintainer review → merge
```

`main` is protected. AI agents never commit to it directly. See [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
