# Getting Started

Two paths, depending on what you want to do. Both are optimised for the same metric: **time from clone to first success**.

## I want to run Juxbly

1. Prerequisites and install: [`../DEVELOPMENT.md`](../DEVELOPMENT.md).
2. Load the unpacked extension (`pnpm dev` → `.output/chrome-mv3`).
3. Open a page with repeating structure — Hacker News is a reliable first target.
4. Click the floating ball, describe what you want, confirm the highlight.
5. Reload the page. The tool should be there again. That moment is the product.

You do not need an API key until a tool actually needs an `llm` step. Juxbly asks at exactly that moment, with a link to create the key and an estimate of what that one build will cost.

## I want to change Juxbly

1. Skim [`../contributing/SCOPE.md`](../contributing/SCOPE.md) — it explains what Juxbly refuses to become and what V1 will not do, which saves you from proposing an out-of-scope feature.
2. Read [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`../CODE_MAP.md`](../CODE_MAP.md).
3. Run `pnpm typecheck && pnpm lint && pnpm test` before and after your change.
4. If your change touches anything on the scope list, open an issue first: re-deciding a constraint needs a discussion, not a pull request.

## I want to contribute without touching core code

Benchmark cases and recipes. Start with [`../contributing/BENCHMARK_GUIDE.md`](../contributing/BENCHMARK_GUIDE.md) or [`../contributing/RECIPE_GUIDE.md`](../contributing/RECIPE_GUIDE.md).
