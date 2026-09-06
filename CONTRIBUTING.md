# Contributing to Juxbly

Thanks for your interest. Juxbly is built by a maintainer working with AI coding agents, and the contribution model is designed so that **you do not need to understand the whole codebase to make a real contribution**.

## The one rule behind everything else

Every task has an explicit scope and an explicit **Do Not Implement** list. Staying inside it matters more than adding more code. If you see something "easy to do while I'm here", open an issue and propose it — don't fold it into an unrelated PR.

## Contribution paths (low friction first)

| Path | What you touch | Gate | Guide |
|---|---|---|---|
| Documentation | `docs/**`, `README.md` | PR review | this file |
| Tests | `tests/unit`, `tests/integration` | CI green | [`docs/testing/TESTING.md`](docs/testing/TESTING.md) |
| Benchmark case | `tests/benchmark/**` | ground truth reproducible | [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md) |
| Recipe | `docs/recipes/**` | desensitised, reproducible | [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md) |
| Bug fix | any package | test proving the fix | issue first |
| Small capability | `packages/capabilities` | security review + benchmark | [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) |
| Core architecture / DSL / permissions | — | **maintainer-controlled**, proposal required | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

Benchmark cases and recipes are the most valuable early contributions: they do not require touching core code, and they directly raise the project's reliability.

## Before you start

1. **Open or claim an issue.** Non-trivial changes go through an issue before code.
2. **Read the right documents.** For an implementation task, read `docs/CONVENTIONS.md`, the relevant section of `docs/ARCHITECTURE.md`, and — only if UI is involved — `docs/UI_SPEC.md`.
3. **Check the scope first.** [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) lists what V1 deliberately does not do. Much of what looks like a gap was decided against, and re-proposing it needs an issue that explains why the constraint should change.

## Development loop

```bash
pnpm install
pnpm dev          # watch build
pnpm test         # unit + integration
pnpm typecheck
pnpm lint
```

Full setup and troubleshooting: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## Pull request expectations

- One logical change per PR. No unrelated formatting, renaming, or refactoring mixed in.
- `pnpm typecheck && pnpm lint && pnpm test` passes locally.
- **Type contracts are written back, not left in code.** If your change adds or modifies a DSL type, a message-protocol field, or a capability's input/output structure, `docs/ARCHITECTURE.md` must be updated in the same PR. A type that exists only in code is a type nobody can review against.
- If your change touches `packages/dsl`, `packages/runtime`, `packages/capabilities`, `packages/health`, `packages/analyzer`, or `packages/repair`, you must also report benchmark / regression results (see [`docs/testing/TESTING.md`](docs/testing/TESTING.md)).
- Tests accompany behaviour changes. Bug fixes ship with a test that fails before the fix.
- The PR description covers: what changed, why, how it was verified, and what is deliberately **not** done.

## Code and security expectations

- TypeScript `strict`; no `any`, no `@ts-ignore`. Use `unknown` plus type guards.
- Comments explain **Why / Constraint / Risk**, never restate the code.
- **Never** introduce `eval`, `new Function`, remote code loading, or dynamic script injection. This is a hard architectural invariant, not a style preference.
- **Never** call `chrome.*` outside `packages/browser`. All platform access goes through the `BrowserAdapter` interface.
- **Never** log API keys, tokens, page content, or user data.
- New capabilities must declare permissions and ship `securityNotes`.

## Report format (also used by AI agents)

```text
1. Change Summary
2. Files Changed
3. Architecture Impact
4. Self-check Results
5. Test Results
6. Benchmark / Regression Results (if applicable)
7. Risks / Known Issues
8. Anything Not Implemented
```

## Review process

Maintainer review is required for merge. Core architecture, the DSL, permissions, and security boundaries are maintainer-controlled. Reviews check architecture consistency, security, test coverage, and scope — in that order of importance.

## Security issues

Do not open a public issue for a vulnerability. See [`SECURITY.md`](SECURITY.md).

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
