# Chrome Web Store review answers

The developer-dashboard fields a reviewer reads, each grounded in the code as it exists —
`docs/ARCHITECTURE.md` §6.4 (port table), §6.4.1 (entrypoint exception), §7.3 (the Policy
Surface) and `PRIVACY.md`. When an answer here and the code disagree, one of them is wrong
and must be fixed before submission; this file is an audit copy, not a wish list.

The store build is what ships (`JUXBLY_VARIANT=store`, `pnpm build:store`). The open-source
build's static `<all_urls>` is documented in `PRIVACY.md` and is not what these answers
describe.

## Single purpose

    Juxbly turns part of the page you are viewing into a small, reusable extraction tool:
    you describe the fields you need, Juxbly reads that page, and shows the result as a
    table you can copy or export.

## Permission justifications

### `storage`

    Persists the user's tools, settings (their own API key and endpoint) and one-time
    first-use flags in chrome.storage.local. Nothing is synced or uploaded; there is no
    Juxbly server.

### `activeTab`

    Grants temporary access to the tab the user invoked Juxbly on: the toolbar popup reads
    the active tab's URL to offer "enable on this page", and the visible-tab capture used
    as a build input is covered by the same invocation. Building a tool always starts from
    an explicit action on that page. No `tabs` permission is requested and no tab metadata
    beyond the URL is read.

### `clipboardWrite`

    Copies the result table to the clipboard when the user clicks Copy on the result
    panel. Runs only from the user's click.

### `downloads`

    Saves the result table as a CSV or JSON file when the user clicks the matching button
    on the result panel. Runs only from the user's click.

### `host_permissions` — `https://api.openai.com/*`

    The default model endpoint. Building a tool asks a model with the user's own API key,
    and a first run that saves only a key calls exactly this origin and nothing else.
    Requests go directly from the browser to the endpoint — never through a Juxbly server,
    because there is none. The manifest origin is paired with the client's default base
    URL and locked by test (`apps/extension/manifest.ts`, `packages/llm/src/client.ts`).

### `optional_host_permissions` — `<all_urls>`

    Requested one origin at a time, only inside an explicit user action, in exactly three
    places: the popup's "Enable on this page"; saving or testing a custom model endpoint
    in settings; installing a preset tool for a specific site. Until the user grants an
    origin, the extension cannot read that page. The permission funnels through one
    adapter port — the only caller of chrome.permissions.* in the codebase — and every
    call runs from an extension page inside the user's own gesture.

### Content script — `matches: ["<all_urls>"]`

    Declared so the extension never needs the `scripting` permission: Chrome injects a
    manifest content script only into origins the user has granted, so the same
    declaration serves both a static and an on-demand surface. With every origin
    ungranted, the content script runs nowhere.

## Declarations

### Remote code

    None. All code ships inside the package. The background locates the extension's own
    resources with runtime.getURL; nothing is fetched from a CDN, nothing is eval'd.

### Data usage (the privacy tab)

- Juxbly does not collect, store (off-device), sell or transfer personal data. The
  checkboxes for advertising, creditworthiness and lending purposes are all "no".
- Page content reaches a model only when a tool the user built actually runs an `llm`
  step, and then only through the user's own API key to the endpoint the user chose.
- Usage numbers (tool count, run count) are computed locally and displayed locally.

### Privacy policy URL

`PRIVACY.md` in the repository:
`https://github.com/liang-index/Juxbly/blob/main/PRIVACY.md`

Confirm the default branch name at submission time; the file, not the branch, is the
policy.

## Pre-submission checklist

- [ ] `pnpm build:store`, and the built `manifest.json` matches §7.3 (static host is
      `https://api.openai.com/*` only; `optional_host_permissions` is `<all_urls>`; no
      `tabs` / `scripting` / `webRequest`).
- [ ] Listing screenshots taken from the store build (see `listing.md`).
- [ ] The listing summary still equals the manifest description.
- [ ] The preset pack size in the listing stays a count-free phrase until the launch pack
      is final (the pack grows toward ~10 in stage 3-3; the copy above never names a
      number).
- [ ] The version badge in options (`JUXBLY_VERSION`) was bumped if this is a release
      build.
