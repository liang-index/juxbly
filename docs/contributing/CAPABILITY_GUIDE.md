# Capability Contribution Guide

A **capability** is an executor for one DSL step type: `extract`, `transform`, `llm`, `render`, or `export`. Capabilities are the intended extension point — but they are also the highest-risk contribution, because a capability is where untrusted input meets the browser.

**Start with an issue, not a PR.** Capabilities require maintainer agreement on scope and permissions before implementation.

## Standard flow

```text
Issue / Proposal → Capability Design → Implementation → Tests → Benchmark → Security Review → PR → Maintainer Review
```

## What your proposal must answer

Answer all eleven. A proposal missing an item will be sent back.

1. **Purpose** — what does it do, in one sentence a user would recognise?
2. **Why it belongs in Juxbly** — does it strengthen a *persistent tool*, or is it a one-off action? (Juxbly is not an RPA platform; an action capability must justify itself against persistent-tool value.)
3. **Input** — the exact input type and its JSON Schema.
4. **Output** — the exact output type and its JSON Schema.
5. **Permissions** — from `CapabilityPermission`: `dom.read`, `clipboard.write`, `downloads`, `llm.call`, `none`.
6. **Security risk** — what can go wrong, and what an attacker who controls the *page* can make it do.
7. **Runtime integration** — how `ToolRuntime` invokes it, and how it behaves on abort.
8. **Browser adapter integration** — which `BrowserAdapter` methods it needs; add them there, never call `chrome.*` yourself.
9. **Tests** — unit and integration, including the failure modes.
10. **Benchmark / examples** — at least one fixture page and one task that exercises it.
11. **Limitations** — what it explicitly does not handle.

## The contract

```ts
interface CapabilityDefinition<I, O> {
  type: ToolStep['type']
  version: string                       // semantic version
  inputSchema: JSONSchema               // draft-07
  outputSchema: JSONSchema
  permissions: CapabilityPermission[]
  securityNotes: string                 // mandatory
  execute(input: I, ctx: ExecutionContext): Promise<O>
}
```

Full definitions, `ExecutionContext`, and `RuntimePorts`: [`ARCHITECTURE.md` §6](../ARCHITECTURE.md).

## Hard rules

- **No dynamic code.** No `eval`, no `new Function`, no remote or injected scripts. Non-negotiable.
- **No `chrome.*`.** Platform access goes through the injected `RuntimePorts` (`ctx.ports`), implemented by `packages/browser`. Your capability must be testable with a mock adapter and no Chrome at all.
- **No new control flow in the DSL.** If you need `if` / loops, you need a new named capability, not a more expressive DSL.
- **Backward compatibility.** Adding a capability must never require rewriting an existing tool. Enum additions are fine; changing existing field semantics is not.
- **Abort handling.** Honour `ctx.signal`. A panel close or page navigation must cancel work, not leak it.
- **No side effects outside declared permissions.** If your capability needs a permission, say so in the proposal — permissions are the maintainer's decision.
- **Never log sensitive data.** Log shape and counts, not content.

## Implementation checklist

- [ ] Lives under `packages/capabilities/<name>/`, one responsibility per file.
- [ ] Registered in `CapabilityRegistry` with `permissions` and `securityNotes`.
- [ ] Input/output schemas are real JSON Schema draft-07 and are used for validation.
- [ ] Registered capability `type` is added to the DSL union and to `validateToolDefinition` — **both directions**, or tools fail to load.
- [ ] Unit tests cover each parameter branch and each failure mode.
- [ ] An integration test runs it through `ToolRuntime` with mock ports.
- [ ] A benchmark fixture and task exist under `tests/benchmark/`.
- [ ] Documentation added: what it does, its parameters, its limits, its permissions.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass.
- [ ] Benchmark / regression results reported in the PR (capability changes touch shared core).

## Review focus

The reviewer checks, in this order:

1. Does it break a module boundary or bypass the registry?
2. Does it introduce dynamic code, permission escalation, an untrusted-input-to-execution path, or a prompt-injection surface?
3. Does it keep the DSL evolvable?
4. Are tests and benchmark evidence real, or nominal?

Core architecture, permissions, and security boundaries are maintainer-controlled. A capability that is useful but misplaced will be rejected with an explanation — that is the design working, not a personal judgement.
