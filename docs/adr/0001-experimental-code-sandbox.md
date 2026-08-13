# ADR 0001: Experimental code sandbox boundary

- **Status:** Accepted for a local proof only
- **Date:** 2026-08-13

## Context

Bound Ledger needs to test whether generated code can orchestrate the same
application-owned capabilities as tool mode without gaining application
authority. Before a code-mode package exists, Phase 6 requires an explicit
threat model, executable escape/resource probes, and a stop decision.

Raw `eval`, `Function`, and Node's `node:vm` are rejected. The Node
documentation explicitly states that `node:vm` is not a security mechanism.
The spike therefore compared two purpose-built candidates:

- [`quickjs-emscripten` 0.32.0](https://github.com/justjake/quickjs-emscripten),
  which exposes interpreter memory, stack, and interrupt controls;
- [`isolated-vm` 6.2.0](https://github.com/laverdet/isolated-vm), which exposes
  V8 isolate memory and execution-time controls.

[`docs/CODE_MODE_THREAT_MODEL.md`](../CODE_MODE_THREAT_MODEL.md) defines the
attacker model and records the executable results. Both candidates pass the 20
current assertions.

`isolated-vm` remains a technically viable fallback, but its own documentation
describes the memory limit as a guideline, warns that leaking a `Reference` or
`ExternalCopy` can compromise isolation, directs catastrophic isolate errors
to terminate the host process, requires `--no-node-snapshot` on current Node,
and says the project is in maintenance mode. Its recommended high-security
shape still places isolates in a separate process.

## Decision

Proceed to a narrowly scoped Phase 7 proof using a fresh synchronous
QuickJS-WASM runtime inside a fresh disposable child process for every program.

The child process is the fail-stop boundary. The QuickJS interrupt, memory, and
stack controls are defense in depth. The parent owns all application state,
trusted context, authorization, budgets, and capability attempts. Communication
uses an explicit size-bounded serialization protocol. No host object, callback,
prototype, promise, or interpreter handle crosses into generated code.

Node `vm` will not be used as a security boundary. `isolated-vm` will not be the
default implementation; it stays in the comparison suite so dependency or
integration evidence can overturn this decision.

This decision permits creating `packages/code-mode`. It does not permit cloud
deployment, real untrusted workloads, a production-security claim, or removal
of the process boundary.

## Why QuickJS-WASM

- It is a separate JavaScript engine represented as WebAssembly rather than a
  same-engine V8 context with transferable host-reference types.
- Its public API supports interrupt, memory, stack, and module-loader controls.
- A fresh module/runtime per child minimizes retained interpreter state.
- It passed the same deterministic global, escape, import, loop, allocation,
  serialization, and size-limit probes as `isolated-vm`.
- It avoids a native Node addon and the `--no-node-snapshot` runtime constraint
  in the eventual selected implementation.

The preference is risk reduction and integration simplicity, not proof that
QuickJS-WASM is intrinsically secure.

## Known limits

- The interpreter heap limit is not a strict child-process RSS limit.
- Allocation failure took materially longer than the nominal interrupt deadline
  in the current probe; the parent hard timeout remains mandatory.
- At decision time, the Phase 6 spike had no application proxy, asynchronous
  gateway protocol, abort race, call budget, mutation budget, or
  recursion-budget test. Phase 7 subsequently added this evidence.
- Engine and WebAssembly vulnerabilities remain possible.
- The isolation tests cover named attack classes, not every JavaScript semantic
  or side channel.
- A subprocess per run has startup and memory overhead that may make the design
  impractical.

## Stop or change direction when

Stop the code-mode track, or return to tool mode, if any of these occur:

- an escape probe exposes process, filesystem, network, environment, module
  loading, database access, host prototypes, or a retained host reference;
- the parent cannot reliably kill loops, allocation pressure, output flooding,
  pending gateway calls, or cancelled work;
- capability or mutation budgets can be bypassed through recursion,
  concurrency, retries, or cancellation races;
- trusted session context or authorization must be copied into generated code;
- the serialization bridge requires exposing a host function or object;
- resource overhead or platform-specific process controls dominate the proof;
- dependency maintenance or security posture makes pinned reproducible builds
  unreasonable;
- five comparative tasks show no meaningful advantage over ordinary Pi tools.

## Consequences

Phase 7 may add only the smallest `@bound/code-mode` proof needed to route
generated SDK calls through the existing capability gateway. It must extend the
probe suite with bridge, abort, recursive-call, call-budget, mutation-budget,
authority-change, and host-reference-retention tests before code mode is
considered successful.

The comparison dependencies and tests remain at the repository root because
they are phase-gate evidence, not reusable application behavior.

## Phase 7 implementation note

Phase 7 implemented the bridge without installing host callbacks in QuickJS.
A pure guest-side generator SDK yields serialized capability requests; the
parent invokes the gateway and resumes the same generator with serialized
data. One fresh runtime and disposable child process are used per program.
Executable package tests cover the bridge, budgets, cancellation, authority
changes, and retained-state boundary.

## References

- [Node `vm` documentation](https://nodejs.org/api/vm.html)
- [`quickjs-emscripten` documentation](https://github.com/justjake/quickjs-emscripten)
- [`isolated-vm` documentation and security guidance](https://github.com/laverdet/isolated-vm)
