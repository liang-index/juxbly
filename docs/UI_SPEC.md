# Juxbly UI_SPEC.md

> This document is the **single source of truth for design tokens and component behaviour rules** of Juxbly.
> Capability boundaries: [`contributing/SCOPE.md`](contributing/SCOPE.md); engineering companion: `docs/CONVENTIONS.md` §13–14.
> When a prototype conflicts with this document, **this document wins**.

---

## 1. Design principles (inherited from the design language spec; non-negotiable)

1. **Never impersonate the host page**: Juxbly's own UI (floating ball / build panel / run panel) uses one visual language on every website and does not adapt to host themes — "learn once, apply everywhere".
2. **Appear on demand**: with no task, the floating ball recedes toward nothing; the run panel collapses on its own once the task completes and never takes up permanent space.
3. **Restraint over richness**: the product has exactly one "signature moment" animation (highlight confirmation); every other interaction serves speed and restraint.

---

## 2. Color tokens

### 2.1 Base palette (values measured from the prototype)

| Token | Value | Usage |
|---|---|---|
| `surface-base-1` | `#0D2B2E` | Dark ink-green gradient start (panel background) |
| `surface-base-2` | `#0b2021` | Dark ink-green gradient end |
| `surface-panel` | `linear-gradient(180deg, rgba(15,44,46,.94), rgba(11,32,33,.97))` | Actual panel background (semi-transparent) |
| `surface-border` | `rgba(94,234,212,.18)` | Panel border |
| `surface-glass` | White at 8%–15% opacity + `backdrop-filter: blur` | In-panel sections, input backgrounds |
| `accent` | `#5EEAD4` | Brand teal: floating ball icon, confirm button, highlight box, active states |
| `accent-hover` | `#7ff2df` | Hover state for accent buttons |
| `accent-dim` | `rgba(94,234,212,.15)` | Secondary emphasis (suggestion chip background) |
| `on-accent` | `#0D2B2E` | Text on accent (buttons) |
| `warn` | `#FBBF24` | **Only** suspected-broken notices; never repurposed |
| `error` | `#FF7A6B` | Confirmed broken state (warm coral, distinct from the plain red common on host pages) |
| `text-primary` | `rgba(255,255,255,.92)` | Primary text |
| `text-secondary` | `rgba(255,255,255,.65)` | Secondary text |
| `text-muted` | `rgba(255,255,255,.40)` | Metadata (version, timestamps, token usage) |
| `ball-gradient` | `linear-gradient(135deg,#2A8577,#0D2B2E)` | Floating ball body gradient |

**Discipline for new colors**: before building any new surface, check whether existing tokens can express it; only three state semantics may exist — `confirm(accent) / warn / error` — so the UI never "looks cobbled together".

### 2.2 Tool category colors (defined here for the first time; closes the open item in the master product doc §3.6)

Maps to `ToolCategory` (ARCHITECTURE.md §5.1): `data | enhance | analyze | export`.

| Category | Value | Semantics |
|---|---|---|
| `data` | `#5EEAD4` (same origin as accent) | Data extraction — the highest-frequency category; uses the brand color |
| `enhance` | `#93C5FD` | Page enhancement |
| `analyze` | `#C4B5FD` | Analysis (llm summarize / classify / sentiment) |
| `export` | `#FDBA74` | Export |

Selection principle: one lightness/saturation family (readable on dark backgrounds), mutually distinguishable at small sizes, and never confusable with `warn` (amber #FBBF24) / `error` (coral #FF7A6B). Category colors are used only for Tool Identity markers (icon backgrounds, category dots, management-page category labels, **the §7.3 result-header dot**), never as large background areas. Fine-tuning after visual review is allowed; any adjustment must update this document.

> **`monitor` removed** (C2): V1 has no scheduled / background execution capability, so no Tool could ever belong to that category;
> keeping the color value would leave one pink in the category system that is never used. When V2 monitoring capability lands it returns additively,
> recoloring at that time in this document (to be evaluated together with whatever new state-semantic colors exist then; no slot is reserved in advance).

> The result-header dot (§7.3 ①) and the Tool Identity category dot are **same origin, same value**: a given Tool must be the same color in results and in the management page; taking a different color in each place is not allowed.

---

## 3. Typography

| Token | Value | Usage |
|---|---|---|
| `font-sans` | System sans-serif stack (no custom fonts loaded) | All Juxbly UI |
| `font-mono` | System monospace stack | **Only** OSS-edition debug / JSON / code views |
| `text-title` | 13–14px, medium (500) | Panel titles |
| `text-body` | 12.5–13px, regular (400) | Body / conversation text |
| `text-meta` | 10.5–11px, regular, `text-muted` | Version, timestamps, token-usage estimates |

The no-custom-fonts trade-off: reliability over font personality (fast rendering under any host page's CSP).

---

## 4. Spacing and radius

| Token | Value |
|---|---|
| `radius-panel` | 16–20px (clearly larger than the typical host-page button radius, reinforcing "a standalone layer floating above the page") |
| `radius-element` | 8–10px (buttons, inputs, chips) |
| `radius-pill` | 999px (floating ball, dots, status labels) |
| `space-panel` | Uniform panel padding of 12–16px |
| `space-group` | In-panel group spacing of 10–12px |

Panels must not invent their own spacing values.

---

## 5. Motion tokens (three tiers; a fourth rhythm is forbidden)

| Tier | Duration | Curve | Usage |
|---|---|---|---|
| `motion-instant` | 0–100ms | ease-out | Hover brighten/scale-up (`scale(1.02)`), press compression rebound |
| `motion-flow` | 200–300ms | `cubic-bezier(.2,.8,.2,1)` | Panel appear/disappear, stage transitions (`jx-rise`: translate + scale + opacity) |
| `motion-signature` | 600ms + 60–80ms stagger per element | `cubic-bezier(.2,.8,.2,1)` | **The only one**: highlight confirmation — multiple elements light up in sequence + soft glow diffusion (`jx-glow`, prototype `jxGlowIn`) |

**One-shot pulse** (`jxOncePulse`): plays once the moment a page with saved tools finishes loading (box-shadow diffusing 0→14px and fading out); does not loop.

**Accessibility (mandatory)**: all motion responds to `prefers-reduced-motion` — when the user enables the system "reduce motion" setting, stagger/glow/pulse degrade to plain fade-in/out or no motion.

---

## 6. Floating ball state machine (visual mapping)

| State | Visual |
|---|---|
| Idle · no saved tools | Fully static, opacity 0.32 (nearly transparent), **no looping motion** |
| Idle · has tools (page just loaded) | One-shot `jxOncePulse`, then quiet |
| Hover | Slight scale-up + brighten (`motion-instant`) |
| Click | Brief compression rebound, then the panel expands |
| Listening / analyzing / awaiting confirmation / building | Distinguished by state color / simple motion (following the six-state build-flow design §3.1), **no text labels needed** |
| Broken | `error` color state |

---

## 7. Component behaviour rules (states on demand, OSS-edition stance)

Do not mechanically require every component to implement every state; check the **applicable** states against the table below:

| Component | Required states |
|---|---|
| Primary action buttons (send / confirm / repair) | Default / Hover / Disabled / Loading (`disabled` while async, **Loading is mutually exclusive**: the same action must never be triggered twice) |
| Suggestion chips | Default / Hover / Focus (keyboard-navigable) |
| Run panel | Loading (light progress indicator; users expect "instant open", keep visuals restrained) / Empty / Error / Degraded badge |
| Result-area provenance rows (① result header / ④ promise line / ⑤ retention line) | Static information, **no Loading, no dialogs, no onboarding overlays**; retention undo (`Don't keep`) requires a second confirmation on click (§7.3) |
| Empty results | 0 rows ≠ error: first run or historically empty → normal empty-state guidance copy; not red, no warning |
| Suspected broken (degraded) | A small "?" note in the panel corner; details visible only when opened — **no interruption, no dialogs** |
| Confirmed broken | Error visual state + one explanation line + CTA ("this tool can't run anymore — the page may have changed") |
| All delete actions | Confirmation dialog; direct deletion forbidden |
| All list views | Show guidance copy when there is no data; blank areas forbidden |
| Input fields | Focus (`accent` outline) / Disabled; Esc collapses **without clearing** the draft |

### 7.1 Run panel view defaults (backfilled in V1.12)

The default of the view type (table / card / plain text) is suggested by the build-stage LLM based on data shape — table-like / list-like data → table; a single rich record → card; summary-type results → plain text — and is written into the config as `render.view`. This is the supporting mechanism for the "finished-product feel" principle: what the user sees first is already the right shape, instead of switching manually every time. Switching views in the run panel only re-renders the same data locally and **never re-runs extract / llm**.

### 7.2 Tool overview behaviour (backfilled in V1.12)

- **List click navigation**: if the target site already has an open tab → switch straight to it; if not → open a new tab.
- The toolbar popup offers no delete/edit actions; those belong to the full management page. Deletion requires a second confirmation (§7).
- **The management-page stats area holds exactly three honest numbers**: total tools, added this week, and total auto-runs to date. "Time saved" style estimated metrics are **explicitly not built** — they violate the honest-copy principle of §9 (run counts are countable; time saved requires invented assumptions). If value perception is ever built, it should be based on user-supplied input — a v2 discussion.
- **Proactive help entry**: the bottom of the toolbar popup carries a link to the GitHub README / a short explainer page, there for users who want it — never pushed during first use.
- **Data source for the stats numbers**: "total auto-runs to date" comes from `ToolUsage.run_count` (ARCHITECTURE §8.1), so the management page and the result area never keep two separate counts.

### 7.3 Result-area provenance rules (Result Provenance)

> This section defines **visuals and component behaviour**; capability boundaries: [`contributing/SCOPE.md`](contributing/SCOPE.md). This section is a change item.

The result area has five segments top to bottom, in a fixed order:

| Segment | Content | Rule |
|---|---|---|
| ① Result header | Category-color dot + tool name + run time + row count + token usage | `text-meta` (10.5–11px / `text-muted`); category dot 6px diameter, `radius-pill`, value from §2.2 `ToolCategory` |
| ② Result body | Table / card / plain text | Default view determined by `render.view` (§7.1) |
| ③ Action area | `Copy` / `CSV` / `JSON` / refresh / change conditions | **Always visible**, never collapsed into a menu; primary-button Loading is mutually exclusive (§7); `Copy` must be triggered by a real click |
| ④ Promise line | Full sentence on first run / minimal version afterwards | `text-meta`; the full sentence shows until `OnboardingFlags.first_tool_built` is true, then the minimal version |
| ⑤ Retention line | `Saved to your tools · Don't keep` | `text-meta`; `Don't keep` is a secondary text button, **click requires a second confirmation** (§7 deletion discipline) |

**Three disciplines** (violating any one counts as noise; the design must be redone):

1. **Do not explain what a Tool is**: only present "next time you open this page, this shows up automatically"; no Tool-concept education.
2. **Do not interrupt**: ①–⑤ are all static information in the result UI — no dialogs, no onboarding overlays, no achievement-style nudges.
3. **Do not demand decisions**: retention happens by default; `Don't keep` is an undo entry, not a pre-choice. **Do not implement a "Tool / Result mode selector"**.

**Copy** (English, referenced by key via `packages/ui/src/copy/`, hardcoding forbidden):

| Location | copy key | en copy |
|---|---|---|
| Promise line · first run | `run.promise.first` | `Next time you open this page, this shows up automatically.` |
| Promise line · recurring | `run.promise.recurring` | `Auto-runs on this page` |
| Retention line | `run.saved` | `Saved to your tools` |
| Retention undo | `run.saved.undo` | `Don't keep` |
| Visual fallback notice | `build.vision_fallback` | `DOM analysis failed. Trying visual understanding.` |

> **Appear-intensity tiers removed** (C1): V1 users do not yet have a 30-day usage history;
> the Active / Quiet / Archived three states are dead code in V1 — impossible to verify and impossible to perceive.
> The floating ball pulse and the overview list ordering follow one unified rule — "pulse when there are tools, order by most recently used" — with no tier states introduced.
> On the data side, `ToolUsage.archived` has been removed (`ARCHITECTURE.md` §8.1): V1 users have no 30-day usage history; tiers would be dead code.

### 7.4 Local usage stats panel (A7)

Show usage numbers that **belong to the user alone**, in the tool overview and the management page.

| Item | Rule |
|---|---|
| Data source | `ToolUsage.run_count` / `last_run_at` / `export_count` / `last_export_at` (`ARCHITECTURE` §8.1) |
| Presentation | `text-meta`; state only countable facts (run count, export count, last used time) |
| **Forbidden** | **Never estimate "how much time was saved"** — run duration is countable; time saved requires invented assumptions (same discipline as §7.2) |
| Privacy note | The panel must carry one persistent line: data stays on this device only. Zero telemetry is a promise — **a promise only holds when it is visible** |

> The value of this section is not the feature; it is turning "zero telemetry" from an invisible virtue into something users can perceive — and are willing to spread on your behalf.

---

## 8. Keyboard interaction grammar

| Scenario | Keys | Behaviour |
|---|---|---|
| Any time | `Ctrl/Cmd+Shift+J` (`chrome.commands`, configurable) | Invoke / collapse Juxbly |
| Build panel | `↑` `↓` | Move focus between suggestion chips |
| Input contexts | `Enter` | Confirm the primary action (send / confirm the highlighted selection) |
| Any Juxbly panel | `Esc` | Collapse back to the floating ball, **state is not lost** |
| Run panel | `Tab` cycle / view-switch key | Switch table / card / plain text |

**Consistency rule**: `Esc` means the same thing in every panel (collapse without clearing); `Enter` confirms the primary action in every input context. Every interactive element must have a **visible keyboard focus ring** (`accent` outline); hover-only without focus is not allowed.

---

## 9. Copy tone (product-wide discipline)

1. First person, short, no exaggeration; no hollow adjectives such as "smart" or "powerful".
2. Broken / error copy always points to a next step ("want to rephrase it?"), not merely a status report ("an error occurred").
3. No exclamation marks; no emotional phrasing like "Awesome!" or "All done!".
4. On every real llm-step call, the panel shows a token-usage estimate in `text-meta` (BYOK transparency).
5. **Copy language** (the product targets Western markets, **English first**; the i18n structure is in place from V1, UI switching is deferred):

| Target | Language |
|---|---|
| In-product UI copy (floating ball hints, panels, error and health copy, command hints, suggestion chips, onboarding copy) | **English** (the only shipping language in V1) |
| Code identifiers / comments / JSDoc / logs | English (`docs/CONVENTIONS.md` §11.4) |
| Repo-facing docs (README / CONTRIBUTING / SECURITY / PRIVACY / CHANGELOG / `docs/` development docs) | English |
| Validation errors | `code` in English and stable (contract); `message` in English (user-facing) |

- **The i18n structure is in place from V1; the switcher UI is not in V1**: all user-facing copy lives in `packages/ui/src/copy/`, referenced by key; hardcoding strings in components is **forbidden**. V1 ships only the `en` locale; locale switching, date/number localization, and language packs beyond `en` belong to iterations after V1.
- **Chinese copy in implementation notes is semantic explanation, not shipping copy**: the Chinese phrasing there (e.g. broken notices, greetings) expresses **semantics and tone**; implementations take the English copy from `copy/`, with tone following the first four rules of §9.
- Reversal cost: if the product ever goes Chinese-first, you only replace the locale content in `copy/` and change one row of this table — which is exactly why copy must be centralized.

---

## 10. OSS-edition information-density extension

The OSS edition **is not another skin**: on top of the same token system it allows higher information density —

- JSON / code / debug views use `font-mono` (the only scenario allowed to deviate from `font-sans`), still with the `surface-glass` background + `accent` keyword highlighting.
- Debug panels may be denser, but radius and spacing tokens stay identical.
- The "this is Juxbly" first-glance recognition must be identical between the Store edition and the OSS edition.
- **The inspector panel can open during the build stage** (backfilled in V1.12): the intermediate evidence behind the generated plan (page analysis results, fields to extract) can be reviewed before highlight confirmation, without waiting for the first run — for developers who want the details.
- **"Advanced mode" memo** (backfilled in V1.12): the config/inspector tabs do not depend on a JS sandbox and could later ship as an optional "advanced mode" toggle for the Store Build (edit scope limited to allowlisted capabilities) — a middle path far cheaper than a full JS sandbox. When to ship it is a product decision; this document only records feasibility.

---

## 11. Implementation constraints

1. All Juxbly UI mounts inside a **Shadow DOM** isolation layer in the content script; styles never leak into the host page, and host styles never pollute Juxbly.
2. CSS custom properties and class names share the unified `jx-` prefix (e.g. `jx-rise`, `jx-glow`).
3. Icons are imported exclusively from the icon module of `packages/ui`; scattered imports from icon libraries are forbidden.
4. Tokens are defined **once** in `packages/ui`'s `tokens.css`, per §2 of this document; components only reference variables and must never hardcode color values.

---

## 12. CSS variable definitions (landing baseline)

```css
:root {
  --jx-surface-base-1: #0D2B2E;
  --jx-surface-base-2: #0b2021;
  --jx-surface-border: rgba(94, 234, 212, 0.18);
  --jx-accent: #5EEAD4;
  --jx-accent-hover: #7ff2df;
  --jx-accent-dim: rgba(94, 234, 212, 0.15);
  --jx-on-accent: #0D2B2E;
  --jx-warn: #FBBF24;
  --jx-error: #FF7A6B;
  --jx-text-primary: rgba(255, 255, 255, 0.92);
  --jx-text-secondary: rgba(255, 255, 255, 0.65);
  --jx-text-muted: rgba(255, 255, 255, 0.40);
  --jx-ball-gradient: linear-gradient(135deg, #2A8577, #0D2B2E);
  --jx-cat-data: #5EEAD4;
  --jx-cat-enhance: #93C5FD;
  --jx-cat-analyze: #C4B5FD;
  --jx-cat-export: #FDBA74;
  --jx-radius-panel: 18px;
  --jx-radius-element: 9px;
  --jx-radius-pill: 999px;
  --jx-motion-instant: 80ms ease-out;
  --jx-motion-flow: 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
  --jx-motion-signature: 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
  --jx-stagger: 70ms;
}
```

Numeric ranges (e.g. radius 16–20px) land in `tokens.css` as a single value; adjusting the single value does not require changing this document; going outside the range requires updating this document first via the doc-change protocol.
