# Store listing copy

The Chrome Web Store listing, as it should be typed into the developer dashboard. Copy
discipline (`docs/UI_SPEC.md` §9, the 2026-09-22 shape ruling): first-person product, short,
no hollow adjectives, no exclamation marks, **no "universal scraper" promise** — the copy
promises the `A` and `D` page shapes only (clear repeating structure; lazy-loaded lists), and
names the limitation instead of hiding it. Zero telemetry is stated as a property, not a
reassurance.

The marketplace description is plain text: no markdown is rendered. Keep the section labels
in caps and the bullets as `-`.

## Name

    Juxbly

Same as the manifest (`copy.extension.name`). 6 characters — the 45-character limit is not a
target.

## Summary (≤ 132 characters)

    Turn what you need on a page into a tool you can reuse.

The manifest description (`copy.extension.description`) **reviewed and kept**: it names the
product's single purpose, promises no page shape, and fits the limit with room to spare.
Reusing it here is deliberate — the manifest description and the store summary must never
disagree, since the manifest is what a user sees before installing.

## Detailed description

```
Juxbly turns part of a page into a small tool you keep.

Describe what you need in your own words — "the title, price and rating of every item on
this page" — and Juxbly reads the page, builds a tool for it, and shows the result as a
table. Keep the tool, open the page again, and run it whenever you want. The result panel
can copy the table or save it as CSV or JSON.

WHAT IT DOES

- Builds a tool from your description and shows the extracted table right away.
- Keeps your tools in your browser. Each tool remembers the page it was built for.
- Ships with a few ready-made tools for well-known practice sites, one click to add from
  the settings page.
- Shows what a model call cost in tokens, every time one is made.

WHAT IT COSTS

Building a tool asks a model, and Juxbly uses your own API key for that — you pick the
provider and the model. Some providers offer a free tier, so this can cost nothing; their
terms change, so check them where you create the key. Reading a page, extracting fields,
filtering, sorting, rendering and export are all local, and cost nothing.

If a tool has no model step, nothing ever leaves your browser.

PRIVACY

- No account, no sync, no telemetry. Juxbly has no server to send anything to.
- Page content is sent only through the API key you configured, to the model endpoint you
  chose. It does not pass through any Juxbly server.
- Your tools and settings stay in your browser's local storage.

WHERE IT WORKS TODAY

Juxbly is new. It works on pages with clear repeating structure — product listings, tables,
search results — and on lists that load more as you scroll. Heavily scripted single-page
apps and pages built from hashed class names are not there yet. When a tool cannot read a
page reliably, the panel says so instead of showing a wrong table.

PERMISSIONS

Juxbly reads nothing until you enable it. When you first use it on a site, it asks for
access to that site only — one origin at a time, never the whole web. The full list, with
the reason for each permission, is in the repository's PRIVACY.md.

SOURCE

Juxbly is open source.
https://github.com/liang-index/Juxbly
```

## Category

`Productivity`.

## Screenshots (to prepare before submission, 1280×800 or 640×400)

1. A built table on a listing page, with the describe field visible.
2. The result panel with Copy / CSV / JSON buttons and the token-cost line.
3. The settings page: key field masked, endpoint, model, usage numbers.
4. The popup overview with tool rows and status words.
5. The enable-on-this-page request — the permission story, shown not claimed.

Every screenshot must come from the store build. A screenshot of a build that silently
granted `<all_urls>` would contradict the listing's own permissions paragraph.
