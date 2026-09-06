# Recipe Contribution Guide

A **Recipe** is a Tool definition you can share. Recipes are a first-class contribution: they let someone else get a working tool for a page without building it themselves, and they feed the benchmark corpus.

> Directory placeholder: [`docs/recipes/`](../recipes/README.md). The export format is produced from stage 1-12 onward; before that, hand-authored recipes are welcome as long as they follow this document.

## What a recipe contains

```text
recipes/<kebab-case-name>/
├── recipe.json      the tool definition + scenario metadata
├── README.md        what it does, which page, how it was verified
├── screenshot.(png|jpg)   optional but strongly encouraged
├── benchmark/       optional: fixture or task used to verify it
└── fixtures/        optional: offline HTML snapshot for regression
```

## `recipe.json` format

The `definition` object is a `ToolDefinition` exactly as defined in [`ARCHITECTURE.md` §5](../ARCHITECTURE.md) — no extra dialect. Around it sits scenario metadata used for curation and matching:

```json
{
  "recipe_version": 1,
  "name": "hacker-news-frontpage-digest",
  "title": "Hacker News front page digest",
  "description": "Collects title, points, comment count and link for each front page post.",
  "scenario": {
    "url_pattern": "news.ycombinator.com/*",
    "site_label": "Hacker News",
    "category": "data",
    "capabilities": ["extract", "transform", "render"],
    "page_difficulty": "regular"
  },
  "health_baseline": {
    "expected_item_count": "20-31",
    "expected_fields": { "title": "text", "points": "numeric", "comments": "numeric" }
  },
  "definition": {
    "tool_id": "tool_hn_digest",
    "name": "HN front page digest",
    "category": "data",
    "url_pattern": "news.ycombinator.com/*",
    "version": 1,
    "steps": [],
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  },
  "provenance": {
    "author": "<your github handle>",
    "license": "CC BY-SA 4.0",
    "verified_on": "2026-01-01",
    "juxbly_version": "0.1.0"
  }
}
```

Field rules:

- `scenario.url_pattern` must match `definition.url_pattern` semantics ([`ARCHITECTURE.md` §5.3](../ARCHITECTURE.md)).
- `scenario.category` is one of `data | enhance | analyze | export` (`monitor` was removed in V1 — no V1 capability can produce a monitor-type tool; see [`ARCHITECTURE.md` §5.1](../ARCHITECTURE.md)).
- The authoritative TypeScript shape of this file is `RecipeJson` in [`ARCHITECTURE.md` §5.5](../ARCHITECTURE.md). If this guide and that section ever disagree, that section wins — and this guide must be fixed in the same change.
- `page_difficulty` is one of `regular | spa | shadow-dom | infinite-scroll | hashed-class` — this is what makes a recipe useful as a benchmark case.
- `health_baseline` describes the **shape** of a healthy result (how many items, what kind of value per field). It never contains actual extracted content.
- `provenance.license` for your recipe content: `CC BY-SA 4.0` or `CC0`. Your choice; the exported JSON asks, it never assumes.

## Desensitisation — mandatory

Before export or commit, verify all of the following are **absent**:

- [ ] API keys, tokens, cookies, session identifiers
- [ ] Any account-specific data (usernames tied to you, private dashboards, internal URLs)
- [ ] Extracted page content or personal data
- [ ] Absolute local paths
- [ ] Any URL that only resolves inside a private network or behind your login

Recipes are public. **A leaked credential is a trust-ending event, not a typo** — check before you commit, and check again in the diff.

## Reproducibility

A recipe that cannot be verified is not useful. Your `README.md` must state:

- The exact URL it was built and verified on, and the date.
- What a successful run looks like (item count range, field shape).
- Anything fragile about it: does the site use hashed class names, infinite scroll, or require login?

If the page changes and the recipe breaks, open an issue or a fix PR — a stale recipe is normal, a silent one is not. Recipes that depend on frequently redesigned sites are expected to fail; note it rather than over-engineering selectors.

## What a recipe is not

- It is not a general-purpose feature request.
- It is not a place to smuggle in capabilities the core does not have (`capabilities` must list only existing ones).
- It is not a distribution channel for scraping sites in a way that violates their terms. ToS-sensitive targets are reviewed before acceptance.

## Submitting

1. Fork, create `docs/recipes/<name>/`, commit the files above.
2. Open a PR describing the scenario and how you verified it.
3. A maintainer checks desensitisation, that it runs, and that the metadata is honest.
4. Accepted recipes may be pulled into the local benchmark corpus ([BENCHMARK_GUIDE.md](BENCHMARK_GUIDE.md)).
