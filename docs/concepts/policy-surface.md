# Concept: the Policy Surface

Juxbly is **one codebase** with **two permission postures**. The Open Source Build declares `<all_urls>` statically; the Store Build starts from almost nothing and asks for each origin when the user does something that needs it. The "Policy Surface" is the (deliberately small) set of places where that second build asks.

This document explains why the split exists and why the asks live where they live. The authoritative manifest shapes, the grant-point table and the accepted degradations are in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) §7.3; this file only argues for them.

## Why two postures at all

The two audiences read the extension differently.

- **The open-source audience** compiles from source. The manifest is one `git grep` away, and anyone unhappy with `<all_urls>` can read every line that touches a page. A broad, disclosed grant is the honest shape here; on-demand permissions would add state (which origins are granted, when, and what happens when one is missing) without reducing what this audience can verify.
- **The store audience** installs a binary and sees a permission warning list. There, `<all_urls>` up front is the most expensive sentence in the listing: it invites the review question "why does a data extractor need every site?" and it asks the user for total trust before Juxbly has done anything at all. The store build inverts that: nothing is readable until the user enables it, site by site.

Both builds request the same four `permissions` and neither requests `tabs`, `scripting` or `webRequest` — the Policy Surface narrows *host* access only. It is a distribution choice, not a capability difference: every feature works in both builds.

## Why one codebase is enough

The obvious implementation is a runtime flag: `if (VARIANT === 'store') …`. That was rejected — a flag spreads into every surface that cares about permissions and becomes a second product that only one build ever exercises.

The implementation instead makes **permission state itself** the only branch:

- The popup's "Enable on this page" section renders only when the active page's origin is *not yet granted* (and is an http(s) page). In the open-source build `permissions.contains` always answers `true`, so the section never appears — no flag, no dead code path, one UI.
- The options page asks for an endpoint's origin on save/test; in the open-source build the ask is a no-op that always answers "already granted".
- The content script still declares `matches: ['<all_urls>']` in both manifests. Chrome injects a manifest content script only where the host permission exists, so the store build's injection scope *is* the grant state. No `scripting` permission, no programmatic injection bookkeeping, one code path.

A pleasant consequence: the mock adapter answers `contains` from a granted-origins set, so every grant flow is unit-tested against the same code the store build runs.

## Why the asks live where they live

A permission prompt is legitimate exactly when the user's click *is* the decision. Three places satisfy that; there are no others.

1. **Popup — "Enable on this page".** The page is open in front of the user and the action click is itself the gesture. This is the front door: without it nothing else on that site can happen.
2. **Options — save / connectivity test.** The user just typed a custom endpoint; asking in the same click means the config and its grant are one decision, and a declined grant can be reported as "no access to this endpoint" instead of being misread as a network failure.
3. **Preset install.** Installing a preset for a site *is* the decision to run it there.

Two flows deliberately do **not** ask. Saving a tool happens in the run panel, a content-script surface where the platform forbids `permissions.request` entirely — and the case never arises, because a tool can only have been built on a page the user already enabled. And the save-tools flow needs no grant at all: if a tool is being built, the page is already granted, and a tool's `url_pattern` must match the page it was built on.

## What the narrowing costs, on purpose

Two behaviours degrade quietly on never-granted pages in the store build, and both degradations are correct:

- A toolbar-overview click that targets a tab on an ungranted page cannot read that tab's URL, so "is this already the tool's page?" is simply never true — the tab is focused or a new one is opened, never misjudged.
- The screenshot fallback after a failed first build only fires where the origin is granted or `activeTab` covers the tab (an action click or shortcut on it) — which on any page a user actually works with is the normal state.

Neither is papered over with a broader permission. A quiet "does not appear" beats a loud "can read everything".

## What this document does not decide

Everything enforceable lives in the architecture document: the exact manifest variants and the default-provider-origin pairing (§7.3), the `permissions` port as the only `chrome.permissions.*` caller (§6.4), and the `tab:active_url` message that lets the popup ask "which page is open" without any `tabs` capability of its own (§7.2). If this file and §7.3 ever disagree, §7.3 wins.
