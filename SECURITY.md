# Security Policy

## Supported version

Juxbly is pre-release. Security fixes are applied to `main` and shipped in the next release. Only the latest release receives fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's private vulnerability reporting on this repository ("Security" → "Report a vulnerability"). If that is unavailable, contact the maintainer directly through the repository profile.

Please include:

- What the issue is and the affected component (background / content script / package).
- Reproduction steps, including the page or fixture involved.
- Impact: what an attacker gains, and what they need to control first (a visited page? a shared recipe? a crafted URL?).
- Suggested fix, if you have one.

You should get an acknowledgement within 7 days. If the report is accepted, you will receive a fix timeline and credit in the release notes unless you ask otherwise.

## Threat model (what Juxbly actually defends against)

Juxbly's architecture exists to keep these boundaries closed. Reports that break one of them are treated as high severity.

| # | Boundary | Invariant |
|---|---|---|
| 1 | No dynamic code | No `eval`, no `new Function`, no remote code loading, no relaxed CSP, anywhere in the repository. The model produces configuration, never code. |
| 2 | API key containment | The BYOK key is stored in `chrome.storage.local`, read **only** in the background service worker, and never enters the content script, the page context, or logs. |
| 3 | Indirect prompt injection | Page content is untrusted input. In every `llm` step it is wrapped as **data**, never as instructions. |
| 4 | DSL double validation | A tool definition is validated before save **and** before execution. Unknown `type` or unknown fields are rejected outright. |
| 5 | Least privilege | Capabilities never call `chrome.*` directly; they go through `BrowserAdapter` with declared permissions. No `tabs`, `scripting`, or `webRequest`. |
| 6 | Regex safety | User/LLM-supplied regular expressions must pass the safe-subset check (ReDoS protection). |
| 7 | No silent repair | A broken tool is never silently rewritten in the background. Repair creates a new, user-confirmed version and keeps the old one. |

## Out of scope (expected behaviour, not a vulnerability)

- A page that deliberately changes its own DOM causing a tool to become stale — that is what Health / Repair / Versioning is for.
- A model producing a wrong or useless tool definition — correctness, not security; report it as a benchmark case.
- Costs incurred by your own API key — you control the endpoint, the model, and when a call happens.
- Anything requiring the attacker to already control the user's browser profile or machine.

## Repository hardening

The project enables dependency vulnerability scanning, secret scanning with push protection, and code scanning. API keys and test credentials must never enter the repository — including Recipes, which are desensitised before export ([`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md)).

## If you are an AI coding agent

Security boundaries are maintainer-controlled. If you believe a change requires weakening one, stop and report it instead of implementing it.
