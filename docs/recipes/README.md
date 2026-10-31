# Recipes

Community-contributed Tool definitions — ready-made tools for specific pages, with the scenario metadata needed to match and curate them.

**Status: four recipes, all of them built by the product itself.** During phase 3-1 dogfooding
each one was built by the extension on the live page it targets, from one request and no hand
editing, and each is also a Phase 2 corpus case — so a recipe and the benchmark measure the
same page. Hand-authored recipes are equally welcome, as long as they follow the format below.

## Layout

```text
recipes/<kebab-case-name>/
├── recipe.json      ToolDefinition + scenario metadata
├── README.md        what it does, the page, how it was verified
├── screenshot.*     optional, encouraged
├── benchmark/       optional verification case
└── fixtures/        optional offline HTML snapshot
```

## Before you add one

Read [`../contributing/RECIPE_GUIDE.md`](../contributing/RECIPE_GUIDE.md). Two rules from it are non-negotiable:

1. **Desensitise.** No API keys, tokens, cookies, account data, private URLs, or extracted page content. Check the diff, not just the file.
2. **Make it reproducible.** State the URL, the date, and what a healthy result looks like (item count range and field shapes).

## Why recipes matter

Recipes are the low-risk end of the contribution ladder: they need no core code change, they double as benchmark cases, and they show new users what "a page can have a tool" actually looks like. They are also the raw material for the curated preset library planned for a later release — but publishing is always an explicit, opt-in act by the author. Private tools stay private: nothing is uploaded automatically.
