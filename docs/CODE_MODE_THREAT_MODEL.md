# Code-mode threat model

## Status and scope

This threat model covers execution of model-generated JavaScript inside Bound
Ledger. The current implementation is an experimental local proof over the
legacy transaction catalog, not a claim that the repository has a production
security boundary.

Phase 6 evaluated runtimes. Phase 7 added the controlled local proof in
`packages/code-mode`; it remains unsuitable for real untrusted workloads.
Phase 15 is planned to replace the hardcoded legacy proxy with one validated,
gateway-filtered general-ledger manifest and to make confirmation-required
termination explicit. Those Phase 15 properties are requirements until their
tests and implementation land; they are not current security claims.

## Assets and trust boundaries

The application must protect:

- process, filesystem, environment, network, database, and credentials;
- trusted actor, workspace, and account authority;
- the capability registry and gateway implementation;
- domain state and capability-attempt records;
- host availability, memory, CPU, and output channels.

Generated programs, model output, capability arguments, resource identifiers,
and values retained between capability calls are untrusted. The capability
gateway remains the only path to ledger behavior. A sandbox decision can
restrict ambient access, but it cannot replace boundary decoding,
authorization, mutation confirmation, or output decoding.

The proposed experimental boundary is:

```text
untrusted program
  -> fresh QuickJS-WASM runtime
  -> disposable child process
  -> serialized capability request
  -> parent-owned capability gateway
  -> ledger
```

No host object, function, prototype, promise, runtime handle, or direct service
reference may cross into the runtime. Data crosses as decoded, size-bounded,
serializable values only.

## Attacker model

Assume a generated program intentionally tries to:

- discover ambient globals or hidden network access;
- escape through prototypes, constructors, indirect `eval`, or imports;
- retain or traverse a host reference;
- exhaust wall time, CPU, memory, stack, program size, or result size;
- recursively call the generated SDK or flood capability calls;
- smuggle a workspace, actor, account, or transaction identifier;
- continue after authority changes, rejection, cancellation, or timeout;
- produce output that is huge, cyclic, executable, or not serializable.

Also assume the chosen interpreter, its WebAssembly host, and the surrounding
Node process may contain bugs. Language-level global removal alone is not an
adequate isolation boundary.

For the Phase 15 manifest migration, additionally assume generated input tries
to influence SDK method names, install an undeclared capability, create a
prototype path, make discovery disagree with the runtime proxy, catch a pending
confirmation and continue, or replay a mutation after the guest should have
stopped.

## Required sandbox contract

Only deliberately installed deterministic helpers and the generated `app`
proxy may be visible. These ambient capabilities remain unavailable:

- `fetch`, `XMLHttpRequest`, `WebSocket`, and other network clients;
- `process`, `require`, module loading, and child processes;
- filesystem, environment, database, and application service objects;
- timers and scheduling primitives;
- host objects and host prototypes.

Every run must enforce:

- interpreter interrupt/deadline plus a parent process hard timeout;
- interpreter memory and stack limits plus a disposable process boundary;
- maximum program and serialized-result sizes before crossing the boundary;
- serializable input and output only;
- total capability-call, mutation-call, and recursion budgets;
- abort propagation to the runtime and any pending gateway call.

The Phase 7 executor enforces capability-call, mutation-call, and in-flight
request-depth budgets in the parent. Its abort signal terminates the child and
interrupts a pending gateway Effect. The gateway still decodes and authorizes
every individual request.

## Phase 15 manifest and confirmation requirements

The general-ledger migration must preserve these additional properties:

- one immutable host-owned manifest generates both progressive discovery and
  the installed guest proxy;
- the manifest is intersected with gateway metadata, and missing, duplicate,
  invalid-path, or kind-mismatched entries fail before worker creation;
- neither the model nor guest program supplies proxy paths, capability names,
  declarations, agent-access values, or source fragments;
- generated proxy source or descriptors remain subject to the program/protocol
  size limits before crossing into the child;
- capability discovery exposes no trusted session, hidden capability, raw
  schema representation, pending-confirmation control, or application object;
- confirmation-required gateway results terminate the child at the parent
  boundary before guest `catch`, retry, or later statements can run;
- the returned pending preview is the gateway's immutable safe preview, and
  approval/rejection remains outside discovery, the proxy, and Pi tools;
- pending and refused requests still count against capability and mutation
  budgets;
- tests prove that discovery, declarations, serialized request names, and the
  installed proxy cannot drift.

Until those requirements have executable evidence, the general-ledger catalog
must not replace the current proof or be described as safely migrated.

## Executable evidence

[`experiments/sandbox/runtime-comparison.test.ts`](../experiments/sandbox/runtime-comparison.test.ts)
runs each probe in a fresh child process. The parent applies a four-second hard
timeout and a 256 KiB stdout buffer. The candidate runner applies a 75 ms
interpreter deadline, a 16 MiB interpreter heap limit, a 512 KiB stack limit,
and 64 KiB program/result limits.

Both QuickJS-WASM and `isolated-vm` currently pass the same 20 assertions:

| Threat or policy | Executable result |
| --- | --- |
| Ambient host globals | All named globals absent |
| Constructor escape | Cannot discover host `process` |
| Indirect `eval` | Cannot discover host `process` |
| Module loading | `node:fs` denied |
| Infinite loop | Interpreter deadline terminates execution |
| Large retained allocation | Interpreter memory limit terminates execution |
| Output flood | Host rejects result over 64 KiB |
| Oversized program | Host rejects program over 64 KiB before evaluation |
| Function output | Host rejects non-serialized output |
| Normal value | Deterministic JSON value crosses the boundary |

Run the evidence with:

```sh
pnpm test:sandbox
```

These probes demonstrate current behavior of pinned dependencies. They do not
prove the absence of engine or host vulnerabilities.

[`packages/code-mode/src/code-mode.test.ts`](../packages/code-mode/src/code-mode.test.ts)
adds executable bridge evidence. It verifies tool/code result and attempt
equivalence, fresh-runtime state, host-global isolation, call and mutation
budgets, request-depth enforcement, dynamic re-authorization, abort during a
pending gateway call, inert request-shaped output, inaccessible resource
refusal, serializable output, and program/result/deadline limits.

The bridge exposes a pure guest-side generator SDK. SDK calls yield serialized
requests; the parent invokes the gateway and resumes the same generator with a
serialized response. No host callback or object is installed in QuickJS.

Phase 8 exposes this boundary to Pi as exactly one sequential `execute_code`
tool. The mandatory generator guide is derived from immutable metadata on the
configured gateway plus frozen, validated code-mode defaults. Invalid custom
limits fail before a child process is created. Direct tool mode remains a
separate projection over the same gateway; neither projection owns authority.

## Residual risk and required follow-up

- A WebAssembly interpreter still shares the child process's native memory and
  host runtime. The process boundary must remain disposable and independently
  killable.
- QuickJS memory interruption is not an operating-system RSS limit. The package
  suite measures termination behavior, but deployment must add an OS or
  platform memory limit where available.
- Generated programs use the controlled generator syntax (`yield*`) rather than
  ordinary async JavaScript. A future agent projection must teach and validate
  this syntax without silently broadening the runtime API.
- Cancellation races can allow a parent request to finish after the program is
  gone. Mutations require request identity, abort handling, and authorization at
  execution time.
- Dependency updates can change isolation behavior. The complete probe suite is
  part of ordinary `pnpm test` and must remain a dependency-upgrade gate.
- Side channels, denial of service against the host machine, multi-tenant
  isolation, and hostile native/Wasm exploits are outside this local proof.

The decision and project stop conditions are recorded in
[`docs/adr/0001-experimental-code-sandbox.md`](adr/0001-experimental-code-sandbox.md).
