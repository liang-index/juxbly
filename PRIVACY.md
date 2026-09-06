# Juxbly Privacy Statement

Juxbly is **local-first**. This document states what the extension stores, what it sends, and what it never does.

## The short version

- Everything Juxbly knows stays in your browser's `chrome.storage.local`.
- There is no Juxbly server, no account, no sync, and **no telemetry**.
- Page content reaches a model only when a tool you built actually needs an LLM step — and then it goes **through your own API key to the endpoint you chose**.
- The Open Source Build's zero-telemetry position is permanent, not a temporary state.

Standard disclosure wording used in the product, key setup, and docs:

> Your page content is sent only through the API key you configured, to the model endpoint you chose. It does not pass through any Juxbly server.

## What is stored locally

| Key | Contents | Why |
|---|---|---|
| `juxbly:tools` | Tool definitions, all historical versions, health state, last run state | so tools persist and can be rolled back |
| `juxbly:settings` | API key, API base URL, model, floating-ball toggle | BYOK configuration |
| `juxbly:onboarding` | Four one-time first-use flags | so first-use hints appear once, not every session |

Run history is deliberately minimal: Juxbly keeps a rolling window of the last 10 run summaries containing only **whether there was data, how many items, and a shape digest per field** — never the extracted content itself. That is enough to detect "this tool behaves differently than before" without storing your data.

## What is sent, and when

| Situation | What leaves the browser | Where it goes |
|---|---|---|
| An `llm` step actually runs, and its input changed | the prompt Juxbly composes, which includes the simplified page content that step depends on | the model endpoint you configured, using your key |
| Nothing else | nothing | — |

Page analysis, extraction, filtering, sorting, rendering, and CSV export are all local. If a tool has no `llm` step, or its extract output has not changed since the last run, **no network request is made**.

## Permissions and why they are needed

| Permission | Reason |
|---|---|
| `storage` | persist tools, settings, and onboarding flags locally |
| `activeTab` | act on the page you have actually opened and interacted with |
| `clipboardWrite` | the `export(copy)` capability |
| `downloads` | the `export(csv)` capability |
| `host_permissions: <all_urls>` | a tool must appear on any page it matches, and BYOK supports custom endpoints |

Juxbly does **not** request `tabs`, `scripting`, or `webRequest`.

Why static `<all_urls>` rather than on-demand host permissions: "a tool appears on the page it matches" requires content-script injection on arbitrary pages; declaring it statically avoids adding the `scripting` permission and the dynamic-injection state management that optional host permissions would require. A future Store Build is expected to converge to optional host permissions through the Policy Surface, without changing this open-source core.

## Your API key

- Stored locally, read **only** in the background service worker.
- Never enters the content script, the page context, or logs.
- You can view, replace, or delete it at any time from the toolbar panel.

## Recipes and shared artifacts

Exporting a Recipe is an explicit, manual action. The exported JSON is desensitised — API keys, cookies, tokens, and private page data are stripped ([`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md)). Juxbly does not upload tools automatically.

## Questions

Open an issue in the repository.
