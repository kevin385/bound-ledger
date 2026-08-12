# Bound — Initial Monorepo Plan

## Purpose

Build the smallest application that can eventually test whether tool mode and
code mode share one application-owned execution boundary.

This is the implementation plan for the first useful vertical slice. The larger
research direction remains in `PLAN.md`.

## Clean-room rule

Bound is an independent implementation.

Other systems may be consulted to understand architectural pressures and failure
modes. Do not copy their code, schemas, tests, prompts, naming catalogs, package
internals, or product-specific abstractions into Bound. Do not commit private
repository paths or internal project details.

For every subsystem:

1. state Bound's local requirement;
2. write the invariant or failing test;
3. implement the smallest local design;
4. consult reference material only for missed failure modes;
5. record decisions that materially constrain later work.

## What we adopt early from the reference project

Only the practices that are cheap now and expensive to retrofit later:

- applications are composition roots;
- reusable behavior lives in packages;
- dependencies point from applications toward packages, never back to apps;
- each package exposes a small explicit public surface;
- shared compiler and dependency versions live at the repository root;
- tests stay beside the behavior they verify;
- untyped input is decoded at the boundary;
- one concept has one owner;
- abstractions require a real boundary or a second consumer.

## What we do not adopt now

- a general harness or engine package;
- feature manifests or automatic feature composition;
- work orders, durable continuations, dependencies, or playbooks;
- identity, policy, database, observability, or provider packages;
- web, API, cloud, or deployment infrastructure;
- a large authoring SDK;
- a generic testing package;
- production-security claims for generated-code execution.

These may appear only after a Bound requirement and test justify them.

## Repository shape now

```text
bound/
  apps/
    cli/                  runnable demo and Effect composition root
  packages/
    ledger/               transaction model and ledger behavior
  docs/
    INITIAL_PLAN.md
  package.json            repository commands
  pnpm-workspace.yaml     workspaces and dependency catalog
  tsconfig.base.json      strict shared compiler policy
```

There are exactly two workspaces because there are currently two real concerns:
domain behavior and process composition.

## Dependency rules

```text
apps/cli  ──>  packages/ledger  ──>  effect
```

- `packages/ledger` must not import from `apps/`.
- `apps/cli` composes dependencies and runs programs; it owns no ledger rules.
- cross-workspace imports use package names such as `@bound/ledger`.
- consumers import from a package's declared exports, not its internal paths.
- no root-level application source is allowed.

## Phase 1 — Make the tiny ledger trustworthy

Add Effect Schema decoding at the fixture boundary and model expected failures
as typed errors.

Deliverables:

- transaction input schema;
- decoded transaction type;
- invalid-fixture test;
- money remains integer cents throughout the domain.

Exit condition: invalid input fails before reaching summary logic.

Do not add a package in this phase. The work belongs to `@bound/ledger`.

## Phase 2 — Add an in-memory ledger service

Add one Effect service inside `@bound/ledger` with two operations:

- list transactions for a month;
- get one transaction by ID.

Keep data in memory. The CLI supplies the Layer at the composition root.

Exit condition: summary behavior uses the service rather than receiving an
imported fixture directly.

Do not add persistence or a separate storage package.

## Phase 3 — Add trusted context and one mutation

Add `updateCategory`, a second workspace, and a small trusted session model.

Exit condition:

- an allowed update succeeds;
- cross-workspace reads and mutations fail;
- failed authorization produces no state change.

Keep this inside `@bound/ledger` until the execution boundary exists.

## Phase 4 — Earn the capability package

Create `packages/capability` only now, because three existing ledger operations
need a common invocation boundary:

- `transactions.list`;
- `transactions.get`;
- `transactions.update_category`.

The invocation path decodes input, receives trusted session context separately,
authorizes each call, executes the operation, decodes output, and records a
small structured attempt.

Dependency direction:

```text
apps/cli  ──>  packages/capability  ──>  packages/ledger
```

Exit condition: direct tests invoke all three operations through one path.

## Phase 5 — Add the first agent adapter

Create `packages/pi-adapter` only after the capability boundary passes its
tests. Project the three capabilities as Pi tools and keep the conversation in
the CLI.

The adapter owns model-facing projection and event translation. It does not own
authorization or ledger behavior.

Exit condition: a deterministic request lists transactions through the real
capability boundary and records the attempt.

Do not add web chat or code mode yet.

## Phase 6 — Evaluate code-mode feasibility

Write the threat model and compare sandbox runtimes with executable escape and
resource-limit tests before creating `packages/code-mode`.

Exit condition: an ADR records the experimental isolation boundary, its known
limits, and the conditions that would stop the project.

## Packages that must earn their existence

| Package | Add when |
| --- | --- |
| `@bound/capability` | Existing operations need one validated and authorized invocation path. |
| `@bound/pi-adapter` | The capability boundary is tested and ready for an agent surface. |
| `@bound/trace` | A second execution surface needs the same trace vocabulary. |
| `@bound/code-mode` | The sandbox ADR passes its decision gate. |
| `@bound/testing` | Two packages genuinely share fixtures or test runtime construction. |
| database package | In-memory behavior is stable and persistence is the next requirement. |
| web application | The CLI demonstrates the full three-capability path. |

## Immediate next task

Implement Phase 1 only. Keep the repository at two workspaces until its exit
condition passes.
