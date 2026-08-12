# Bound Ledger — Initial Implementation Plan

## Document role

This document is the authoritative implementation sequence for the current
repository. Follow its phases in order.

[`PLAN.md`](../PLAN.md) is the longer research thesis and target architecture.
It explains where Bound Ledger may eventually go, but it does not override the
package gates or immediate task in this document.

**Current phase:** Phase 5 — Add the first agent adapter.

## Purpose

Build the smallest application that can eventually test whether tool mode and
code mode share one application-owned execution boundary.

The first useful vertical slice is intentionally local and deterministic. It
must establish trustworthy domain behavior before an agent, cloud runtime,
database, UI, or sandbox is introduced.

## Project naming

- Product and repository display name: **Bound Ledger**.
- Repository slug: `bound-ledger`.
- Package namespace: `@bound/*`.
- Reference domain: an expense ledger.

The package namespace remains `@bound/*`; renaming the repository does not
require renaming existing package imports.

## Clean-room rule

Bound Ledger is an independent implementation.

Other systems may be consulted to understand architectural pressures and
failure modes. Do not copy their code, schemas, tests, prompts, naming catalogs,
package internals, or product-specific abstractions into Bound Ledger. Do not
commit private repository paths or internal project details.

For every subsystem:

1. State Bound Ledger's local requirement.
2. Write the invariant or failing test.
3. Implement the smallest local design.
4. Consult public reference material only for missed failure modes.
5. Record decisions that materially constrain later work.

## Practices adopted early

Only adopt practices that are cheap now and expensive to retrofit later:

- applications are composition roots;
- reusable behavior lives in packages;
- dependencies point from applications toward packages, never back to apps;
- each package exposes a small explicit public surface;
- shared compiler and dependency versions live at the repository root;
- tests stay beside the behavior they verify;
- untyped input is decoded at the boundary;
- one concept has one owner;
- abstractions require a real boundary or a second consumer.

## Deferred architecture

Do not introduce these during the current phase:

- a general harness or engine package;
- feature manifests or automatic feature composition;
- work orders, durable continuations, dependencies, or playbooks;
- identity, policy, database, observability, or provider packages;
- web, API, cloud, or deployment infrastructure;
- a large authoring SDK;
- a generic testing package;
- production-security claims for generated-code execution.

Each may appear only after a Bound Ledger requirement, test, and phase gate
justify it.

## Repository shape now

```text
bound-ledger/
  apps/
    cli/                  runnable demo and Effect composition root
  packages/
    capability/           validated and authorized invocation boundary
    ledger/               transaction model and ledger behavior
  docs/
    INITIAL_PLAN.md
  package.json            repository commands
  pnpm-workspace.yaml     workspaces and dependency catalog
  tsconfig.base.json      strict shared compiler policy
```

There are exactly three application/package workspaces because there are now
three real concerns: domain behavior, capability invocation, and process
composition.

## Dependency rules

```text
apps/cli  ─┬─>  packages/capability  ──>  packages/ledger  ──>  effect
           └────────────────────────>  packages/ledger
```

- `packages/ledger` must not import from `apps/`.
- `packages/capability` may depend on `packages/ledger`, but never on `apps/`.
- `apps/cli` composes dependencies and runs programs; it owns no ledger rules.
- Cross-workspace imports use package names such as `@bound/ledger`.
- Consumers import from a package's declared exports, not its internal paths.
- No root-level application source is allowed.
- Effect v4 is the chosen effect and schema library for this implementation.
- Direct dependencies remain exactly pinned; do not introduce version ranges.

## Phase rules

- Complete the current phase's tests and exit condition before starting the
  next phase.
- Do not scaffold packages named by later phases in advance.
- A phase may refine internal file names, but it may not move ownership across
  the declared package boundaries without updating this document first.
- Every phase must keep `pnpm check` passing.

## Phase 1 — Make the tiny ledger trustworthy

Decode fixture data with Effect Schema and model expected decoding failure as a
typed error. Summary behavior must receive decoded transactions only.

### Expected files

```text
packages/ledger/src/
  transaction.ts          schemas and schema-derived domain types
  fixtures.ts             unknown fixture input and fixture decoder
  fixtures.test.ts        fixture decoding and validation boundary tests
  ledger.ts               summary behavior over decoded transactions
  ledger.test.ts          summary behavior and decoded-input flow tests
  index.ts                explicit public exports
apps/cli/src/main.ts       decode, summarize, and render at the composition root
```

### Transaction contract

- `id` is a non-empty string.
- `month` uses `YYYY-MM` with a month from `01` through `12`.
- `merchant` and `category` are non-empty after trimming.
- `amountCents` is a signed safe integer.
- Negative amounts are valid because later fixtures include refunds.
- Fractional, infinite, `NaN`, and unsafe integer amounts are invalid.
- The `Transaction` TypeScript type is derived from the schema rather than
  maintained as a duplicate handwritten interface.

The raw deterministic fixture is typed as `unknown`. A public decoder accepts
`unknown` and returns an Effect containing decoded read-only transactions or an
`InvalidFixtureError`. The error must have a stable `_tag` and retain useful
schema failure details without exposing raw secrets.

### Required tests

`fixtures.test.ts` owns fixture-decoding and validation-boundary coverage:

- The existing July fixture decodes.
- An invalid calendar month is rejected.
- A blank merchant or category is rejected.
- A fractional cent amount is rejected.
- A negative refund amount is accepted.

`ledger.test.ts` owns summary behavior and verifies that invalid fixture input
fails before summary behavior is invoked:

- The decoded July fixture produces the unchanged summary.
- Invalid fixture input fails before summary behavior is invoked.

### Verification

```sh
pnpm check
pnpm start
```

`pnpm start` must continue to print the deterministic July 2026 summary.

### Non-goals

- No service layer.
- No mutation.
- No authorization or trusted session.
- No capability package.
- No agent or model dependency.
- No Cloudflare infrastructure.

**Exit condition:** invalid fixture input fails with `InvalidFixtureError`
before reaching summary logic, and every required test passes.

## Phase 2 — Add an in-memory ledger service

Add one Effect service inside `@bound/ledger` with two operations:

- list transactions for a month;
- get one transaction by ID.

Keep data in memory. The CLI supplies the Layer at the composition root. Model
an expected missing transaction as a typed domain error.

**Exit condition:** summary behavior obtains transactions through the service
rather than receiving an imported fixture directly.

Do not add persistence or a separate storage package.

## Phase 3 — Add trusted context and one mutation

Extend the in-memory domain fixtures with a second household workspace and
account ownership. Here, “workspace” means a ledger tenant in the domain model,
not another pnpm workspace.

Add `updateCategory` and a small trusted session model. Actor identity, active
workspace, readable account IDs, and mutable account IDs come from the
composition root and never from model-controlled operation input.

**Exit condition:**

- an allowed update succeeds;
- reads and mutations against the inaccessible household workspace fail;
- reads and mutations against inaccessible accounts fail;
- failed authorization produces no state change.

Keep this behavior inside `@bound/ledger` until the common invocation boundary
exists.

## Phase 4 — Earn the capability package

Create `packages/capability` only now, because three existing ledger operations
need one validated and authorized invocation path:

- `transactions.list`;
- `transactions.get`;
- `transactions.update_category`.

The invocation path decodes input, receives trusted session context separately,
authorizes each call, executes the operation, decodes successful output, and
records a small structured attempt.

Dependency direction:

```text
apps/cli  ──>  packages/capability  ──>  packages/ledger
```

The CLI may also provide ledger Layers at the composition root, but the
capability package must never depend on the CLI.

**Exit condition:** direct deterministic tests invoke all three operations
through one common path.

## Phase 5 — Add the first agent adapter

Create `packages/pi-adapter` only after the capability boundary passes its
tests. Project the three capabilities as Pi tools and keep the conversation in
the CLI.

The adapter owns model-facing projection and Pi event translation. It does not
own authorization, trusted context, or ledger behavior. Use sequential tool
execution initially.

CI must exercise the adapter with a deterministic fake model stream and no API
key. A live model smoke test is optional and must never run in ordinary CI.

**Exit condition:** a deterministic prompt lists transactions through Pi Agent
Core and the real capability boundary, and records the capability attempt.

Do not add web chat or code mode yet.

## Deployment checkpoint — after Phase 5

Only after the local CLI agent path works may a Cloudflare proof of concept add
`apps/worker` as another composition root.

The Worker may own HTTP transport, environment bindings, and Effect Layer
construction. It must reuse `@bound/pi-adapter` and the capability gateway. It
must not own ledger behavior, authorization, or a second agent loop.

For the first deployment proof:

- use a single JSON request and response;
- keep ledger data deterministic and in memory;
- keep secrets in Cloudflare bindings or local ignored files;
- do not add Durable Objects, D1, KV, R2, Vectorize, or a web UI;
- do not introduce Cloudflare Agents SDK or Think alongside Pi Agent Core;
- require a separate explicit approval before deployment.

Cloud deployment is optional evidence and does not change the Phase 6 gate.

## Phase 6 — Evaluate code-mode feasibility

Write the threat model and compare sandbox runtimes with executable escape and
resource-limit tests before creating `packages/code-mode`.

**Exit condition:** an ADR records the experimental isolation boundary, its
known limits, and the conditions that would stop the project.

## Packages that must earn their existence

| Package | Add when |
| --- | --- |
| `@bound/capability` | Three existing operations need one validated and authorized invocation path. |
| `@bound/pi-adapter` | The capability boundary is tested and ready for an agent surface. |
| `@bound/trace` | A second execution surface needs the same trace vocabulary. |
| `@bound/code-mode` | The sandbox ADR passes its decision gate. |
| `@bound/testing` | Two packages genuinely share fixtures or test runtime construction. |
| Database package | In-memory behavior is stable and persistence is the next demonstrated requirement. |
| Web application | The CLI demonstrates the full three-capability agent path. |

## Immediate next task

Implement Phase 5 only. Introduce `packages/pi-adapter`, project the three
capabilities as sequential Pi tools, and prove the local agent path with a
deterministic fake model stream that requires no API key.

When the current phase is complete, update **Current phase** at the top of this
document in the same pull request. A new contributor should never need an
issue, private repository, or prior conversation to discover the next permitted
work.
