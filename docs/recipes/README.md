# Recipes

Community-contributed Tool definitions — ready-made tools for specific pages, with the scenario metadata needed to match and curate them.

**Status: placeholder.** This directory starts receiving content from stage 1-12, which ships the Recipe export format. Hand-authored recipes are welcome before then, as long as they follow the format below.

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
