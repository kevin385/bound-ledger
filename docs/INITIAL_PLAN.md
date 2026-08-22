# Bound Ledger — Initial Implementation Plan

## Document role

This document is the authoritative implementation sequence for the current
repository. Follow its phases in order.

[`PLAN.md`](../PLAN.md) is the longer research thesis and target architecture.
It explains where Bound Ledger may eventually go, but it does not override the
package gates or immediate task in this document.

**Current phase:** Phase 14 complete — the coherent human-application baseline
is implemented and verified.

## Purpose

Build the smallest application that can test whether tool mode and code mode
share one application-owned execution boundary over deterministic financial
behavior.

Phases 1–9 intentionally used a narrow transaction slice to establish the
capability, agent, sandbox, and evaluation boundaries. Phase 10 corrects the
domain foundation before more code-mode, ingestion, persistence, or UI work.

## Project naming

- Product and repository display name: **Bound Ledger**.
- Repository slug: `bound-ledger`.
- Package namespace: `@bound/*`.
- Reference domain: a personal financial ledger.

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
- production-security claims for generated-code execution;
- source-specific ingestion adapters;
- multi-currency, foreign exchange, security lots, or market valuation;
- an interest-policy engine.

Each may appear only after a Bound Ledger requirement, test, and phase gate
justify it.

## Repository shape now

```text
bound-ledger/
  apps/
    cli/                  runnable demo and Effect composition root
  packages/
    capability/           validated and authorized invocation boundary
    code-mode/            bounded guest SDK and subprocess execution bridge
    ledger/               financial domain and legacy transaction proof
    pi-adapter/            Pi tool projection and event translation
  docs/
    adr/0001-experimental-code-sandbox.md
    CODE_MODE_THREAT_MODEL.md
    INITIAL_PLAN.md
  experiments/
    sandbox/              executable runtime comparison and threat probes
  evals/
    results/              checked-in paired evaluation summary
  package.json            repository commands
  pnpm-workspace.yaml     workspaces and dependency catalog
  tsconfig.base.json      strict shared compiler policy
```

There are exactly five application/package workspaces because there are now
five real concerns: domain behavior, capability invocation, bounded generated
code execution, model-facing Pi adaptation, and process composition.

## Dependency rules

```text
apps/cli  ─┬─>  packages/pi-adapter  ─┬─>  packages/code-mode  ─┐
           │                           └─>  packages/capability  ├─>  packages/ledger
           ├─>  packages/code-mode  ─────>  packages/capability  │
           ├────────────────────────────>  packages/capability  │
           └───────────────────────────────────────────────────>  packages/ledger
```

- `packages/ledger` must not import from `apps/`.
- `packages/capability` may depend on `packages/ledger`, but never on `apps/`.
- `packages/pi-adapter` owns Pi tool/code projection and event translation. It
  may depend on `packages/capability` and `packages/code-mode`, but never on
  `apps/` or ledger internals.
- `packages/code-mode` owns the generated guest SDK and isolated execution
  bridge. It may depend on `packages/capability`, but never on `apps/`, ledger
  internals, or trusted session construction.
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

Phase 6 selected a fresh QuickJS-WASM runtime inside a disposable child process
for a local proof only. The evidence is in
[`experiments/sandbox`](../experiments/sandbox), the threat model is
[`CODE_MODE_THREAT_MODEL.md`](CODE_MODE_THREAT_MODEL.md), and the decision is
[`ADR 0001`](adr/0001-experimental-code-sandbox.md).

## Phase 7 — Build the controlled code-mode proof

Create `packages/code-mode` now that the sandbox decision gate has passed.
Implement the smallest generated `app` proxy and execution boundary that can
list July 2026 transactions through the existing capability gateway.

The implementation must follow ADR 0001:

- one fresh QuickJS-WASM runtime in one disposable child process per program;
- an explicit size-bounded serialization protocol with no host references;
- trusted session context, authorization, and attempt recording remain in the
  parent-owned capability gateway;
- wall-clock, memory, stack, program, result, capability-call, mutation-call,
  and recursion limits are enforced;
- abort stops the runtime and any pending gateway request;
- no network, filesystem, environment, process, timer, import, database, or
  direct ledger access is exposed.

Extend the executable evidence with bridge, recursive-call, call-budget,
mutation-budget, abort, authority-change, and host-reference-retention tests.
Do not add a general harness, tracing package, web surface, or live model path.

**Exit condition:** a deterministic generated program lists July transactions
through `@bound/code-mode` and the real capability gateway, records the same
capability attempt as tool mode, and all sandbox/bridge escape and resource
tests pass without an API key.

Phase 7 uses a pure guest-side generator SDK: `yield*` emits serialized
capability requests, and the parent resumes the same QuickJS generator with
serialized gateway responses. No host callback or trusted object enters the
runtime. The CLI and deterministic tests exercise the real gateway.

## Phase 8 — Add the bounded code-mode agent projection

Project code mode into Pi Agent Core only after the direct Phase 7 boundary is
stable. Add one sequential `execute_code` tool and one compact capability
discovery surface owned by `@bound/pi-adapter`; reuse `@bound/code-mode` and do
not create another agent loop or execution path.

Use a deterministic fake model stream that emits the checked-in July listing
program. The adapter must present the generator SDK syntax and limits clearly,
translate execution events, and return only serialized result/metadata. It must
not expose the gateway, trusted session, raw schemas, interpreter handles, or
child-process controls to the model.

Add paired deterministic coverage showing the existing tool projection and the
new code projection produce the same July result and core capability attempt.
Keep outer tool execution sequential. Do not add a UI, live model requirement,
general evaluation framework, or additional domain operations.

**Exit condition:** a deterministic prompt completes through Pi Agent Core's
`execute_code` tool, the real `@bound/code-mode` boundary, and the real
capability gateway without an API key; its result and core attempt equal the
existing tool-mode path.

Phase 8 keeps one Pi Agent Core loop per run and selects an explicit projection
mode. Code mode exposes exactly one sequential `execute_code` tool. Its compact
guide is built from immutable gateway metadata, Pi-owned SDK spellings, and
validated code-mode limits. Paired fake-model coverage proves the tool and code
projections return the same July result and capability attempt.

## Phase 9 — Record the first paired evaluation task

Create one versioned evaluation task for the existing July listing prompt. Run
the tool and code projections from identical reset fixture state and record a
small comparable result for each mode: final answer, capability attempts, outer
model turns/tool calls, inner capability-call count, duration, and deterministic
correctness/safety scores.

Keep this as one concrete task and runner; do not create `@bound/testing`, a
general evaluation framework, UI, persistence, or live-model requirement. Raw
timing is diagnostic only because the faux provider is deterministic and the
code path starts a subprocess.

The scorer must verify the three expected July transaction IDs, one authorized
`transactions.list` attempt, no mutation, no inaccessible transaction, and no
extra capability call. Commit the task version and a reproducible summary, but
do not claim broader code-mode advantage from one task.

**Exit condition:** one repository command runs the paired task without an API
key, fails on result/attempt/safety divergence, and emits a versioned summary
that clearly labels the sample size and deterministic configuration.

Phase 9 keeps the versioned task, runner, and scorer in the CLI composition
root. Each mode receives a fresh decoded fixture and gateway. The checked-in
summary records one deterministic sample, separates outer model/tool counts
from inner capability calls, treats timing as diagnostic, and makes no broader
claim from the result.

## Phase 10 — General ledger kernel

The Phase 1–9 `Transaction` model was deliberately sufficient for proving the
execution boundary, but it is not the product's financial foundation. Its
stored `month`, single-account amount, merchant/category requirements, and
in-place category update cannot represent a general append-only ledger.

Build the new foundation inside `@bound/ledger` before adding more capabilities,
code-mode behavior, ingestion, persistence, or UI.

### Local requirement

Implement one in-memory, single-currency personal financial ledger that:

- records ambiguous interpretations as proposals that do not affect balances;
- atomically appends immutable posted events with balanced postings;
- represents deposits, contributions, transfers, withdrawals, expenses,
  refunds, and adjustments through the same event/posting contract;
- derives balances, trial balance, expenses, and date-range activity from
  postings;
- corrects economic facts with linked reversal and replacement events;
- preserves source and audit provenance without trusting model-supplied actor
  identity or recorded time.

### Domain contract

Keep one concept owner inside `@bound/ledger`:

- `Ledger` identifies the financial and authorization context. New domain APIs
  use ledger terminology; any temporary mapping from the historical workspace
  name belongs at a compatibility boundary.
- `Account` has an ID, ledger ID, display name, currency, accounting class, and
  product subtype. Accounting classes are `asset`, `liability`, `equity`,
  `income`, and `expense`. Initial subtypes may include `cash`, `bank`,
  `credit_card`, `loan`, `receivable`, `investment`, `expense_category`, and
  `income_source`.
- `EventProposal` contains a proposed event kind, effective time, candidate
  postings, provenance, and explicit assumptions. An assumption records the
  affected field, proposed value, confidence, rationale, and optional source
  evidence reference. Proposals never participate in projections.
- `FinancialEvent` is an immutable posted event with an application-owned ID,
  ledger ID, kind, effective time, trusted recorded time, trusted actor ID,
  idempotency key, provenance, balanced postings, and optional typed lineage.
- `Posting` contains an account ID, currency, signed integer `amountMinor`, and
  optional description/classification metadata. Positive is debit and negative
  is credit. Asset and expense balances normally increase with debits;
  liability, equity, and income balances normally increase with credits.
- `Provenance` identifies source kind, stable source reference, source digest,
  correlation/causation IDs, and optional evidence references. Do not require
  raw source contents or expose them through errors.

Event kinds are descriptive, not separate balance implementations. Postings
remain authoritative. For example:

- a checking-to-cash withdrawal debits cash and credits checking, so it is not
  an expense;
- a checking expense debits an expense account and credits checking;
- a credit-card expense debits an expense account and credits a liability;
- a transfer balances two financial accounts and nets to zero;
- a refund or correction uses explicit contra/reversal postings rather than a
  negative convention hidden in one transaction amount.

### Posting invariants

- Amounts are safe integer minor units; no floats, `NaN`, infinities, or unsafe
  integers cross the boundary.
- Phase 10 supports one configured ISO currency. Every account and posting in
  the ledger uses it.
- A posted event has at least two postings and the signed sum is exactly zero.
- Every posting references an existing account in the same ledger.
- Event append, authorization, validation, and idempotency checks are atomic.
  Failure appends nothing.
- `(ledgerId, idempotencyKey)` is unique. Repeating the same source cannot
  duplicate balances.
- `effectiveAt` is a decoded instant stored in canonical UTC. Date ranges are
  half-open `[from, to)`; month and other reporting periods are derived.
- `recordedAt`, actor identity, active ledger, and account permissions come from
  trusted runtime context, not capability or model input.
- A reversal contains the exact negation of the original postings and a
  `reverses` link. A corrected replacement is independently balanced and links
  to the reversed event.
- A posted event can be reversed at most once, and lineage targets must exist in
  the same ledger.
- `balancesAt` returns the signed debit-positive balance per account; liability,
  equity, and income display amounts are later normalized projections.
- Expense totals are the net debit activity of expense-class accounts, not
  every event that reduces a cash account.
- Balances and reports are rebuildable from the append-only posted-event
  sequence. No projection is a mutation source.

### Smallest service surface

The in-memory domain service may expose only the operations needed to prove the
kernel:

```text
appendProposal
queryProposals
postEvent
getEvent
queryEvents
reverseEvent
balancesAt
activityForRange
trialBalanceAt
```

These are domain operations, not yet model-facing capabilities. Do not build a
generic event-sourcing framework or a second service/package for them.

### Expected files

```text
packages/ledger/src/
  money.ts                    fixed-precision money and currency schemas
  account.ts                  ledger account classes and subtypes
  financial-event.ts          proposal, event, posting, lineage, provenance
  financial-fixtures.ts       unknown deterministic kernel fixtures
  financial-fixtures.test.ts  fixture boundary tests
  ledger-kernel.ts            append-only in-memory behavior and projections
  ledger-kernel.test.ts       invariant and projection tests
  index.ts                    explicit public exports
```

File names may be refined, but ownership must remain in `@bound/ledger` and the
package must not import capability, agent, sandbox, or application code.

### Required tests

- Valid account, proposal, event, posting, and provenance fixtures decode.
- Fractional, unsafe, and wrong-currency amounts fail before behavior.
- An unbalanced event, one-posting event, unknown account, cross-ledger posting,
  and duplicate idempotency key each fail with a typed error and append nothing.
- A deposit/contribution produces the expected asset and income/equity balance.
- A checking-to-cash withdrawal changes both asset accounts and produces no
  expense.
- A checking expense reduces the asset balance and increases expenses.
- A credit-card expense increases a liability and expenses without changing
  cash.
- A transfer changes two account balances and nets to zero.
- A refund produces the intended contra effect.
- A proposal with assumptions is queryable but never affects balances.
- Balance, trial-balance, expense, and half-open date-range activity projections
  are derived correctly from effective timestamps.
- Reversal exactly negates the original event, preserves both records, carries
  lineage/provenance, cannot be duplicated, and can be followed by a balanced
  replacement.
- Reads and appends against an inaccessible ledger or account fail without
  state change.
- Replaying the posted-event sequence rebuilds identical projections.

### Compatibility rule

Keep the Phase 1–9 transaction vertical slice and its paired evaluation passing
throughout Phase 10, but treat it as a legacy compatibility slice and add no new
behavior to it. The general kernel becomes the new domain foundation. A later
documented phase must migrate the capability catalog and paired evaluation to
`accounts.*`, `events.*`, and `reports.*`, redefine transaction-shaped views as
derived projections where useful, and only then delete the legacy `Transaction`
schema or `transactions.*` capabilities.

### Non-goals

- No generic capability migration or additional model-facing tool.
- No changes to Pi Agent Core, tool/code projections, or the sandbox.
- No Notes, CSV, manual-entry, bank-export, or bank-connection adapter.
- No database, API, web UI, deployment, or new workspace package.
- No multi-currency, foreign exchange, market prices, investment lots, gains,
  tax behavior, payment initiation, or financial advice.
- No interest policy, compounding, day-count, repayment, or accrual engine.
- No budgets, merchant rules, recurring detection, or categorization automation.
- No claim that the kernel is production accounting or banking software.

Interest is intentionally deferred: its effective-dated rates, rounding,
compounding, schedules, and day-count rules require the posting kernel to be
stable first. When earned, an interest service will calculate deterministically
and append an ordinary interest-accrual event; the model will not supply the
authoritative amount.

### Verification

```sh
pnpm check
pnpm start
pnpm eval:july-list
```

The existing CLI and paired evaluation remain compatibility evidence. New
kernel behavior is proved directly through deterministic domain tests without
an API key.

**Exit condition:** the in-memory kernel atomically appends the required
representative events, rejects every invalid append without state change,
derives correct balances/trial balance/expenses/date-range activity, reverses
and replaces an event without rewriting history, preserves complete provenance,
and keeps every pre-existing check passing.

Phase 10 added the single-currency append-only kernel and its deterministic
fixture, invariant, authorization, projection, reversal, replacement, and replay
coverage. The legacy transaction proof remains intact as compatibility evidence.

## Phase 11 — Add read-only general-ledger capabilities

Move the first earned general-ledger operations through the existing capability
gateway before changing either agent projection. This phase proves that the new
kernel can use the same input validation, trusted-session separation,
authorization, output validation, and structured attempt path as the legacy
transaction slice.

### Capability surface

Add only these read capabilities:

```text
accounts.list
events.get
events.query
reports.balance
reports.activity
reports.trial_balance
```

`accounts.list` may add the smallest corresponding read operation to
`LedgerKernelService`. It returns only accounts in the active ledger that the
trusted session may read. Event queries and reports continue to derive from
posted events and use half-open effective-time ranges.

Keep the new definitions in a separate general-ledger catalog. The default
tool/code catalog remains the legacy transaction catalog during this phase, so
the Phase 1–9 agent proof and paired July evaluation do not silently change.
During the transition, the common gateway runtime may compose both in-memory
services; it must still use one registry and invocation implementation.

### Required tests and evidence

- The kernel lists only readable accounts from the active ledger.
- Direct gateway tests invoke all six capabilities through one path.
- ISO timestamp strings decode to canonical UTC values before execution.
- Unexpected properties and invalid timestamps fail before authorization or
  execution.
- Missing active-ledger authority and inaccessible events fail closed and are
  recorded as structured refusals.
- Successful outputs are decoded before returning to the caller.
- One deterministic CLI command prints accounts, July activity, balances, and
  trial balance through the general-ledger catalog.
- The legacy CLI demonstration and paired July evaluation remain unchanged and
  passing.

### Expected files

```text
packages/ledger/src/ledger-kernel.ts
packages/ledger/src/ledger-kernel.test.ts
packages/capability/src/general-ledger-capabilities.ts
packages/capability/src/general-ledger-capabilities.test.ts
packages/capability/src/capability.ts
packages/capability/src/gateway.ts
packages/capability/src/index.ts
apps/cli/src/read-general-ledger.ts
```

### Non-goals

- No posting, reversal, replacement, proposal append, or other mutation
  capability.
- No confirmation mechanism.
- No change to Pi tool projection, code-mode discovery, generated SDK behavior,
  sandbox limits, or the paired evaluation task.
- No removal or extension of the legacy `Transaction` model or
  `transactions.*` capabilities.
- No persistence, ingestion, interest, UI, or new workspace package.

### Verification

```sh
pnpm check
pnpm start
pnpm demo:ledger-read
pnpm eval:july-list
```

**Exit condition:** all six read-only general-ledger capabilities execute
through the common gateway with decoded inputs and outputs, trusted
authorization, and structured attempts; the deterministic CLI evidence is
reproducible; and every legacy tool/code check remains passing.

Phase 11 added the separate read-only general-ledger catalog, authorized account
listing, decoded UTC report inputs, validated domain outputs, direct gateway
coverage, and deterministic CLI evidence. The default agent catalog remains the
legacy transaction slice, and its paired evaluation continues to pass unchanged.

## Phase 12 — Add confirmation-bound general-ledger mutations

Add the smallest trusted confirmation boundary needed to expose kernel
mutations without granting the model or an ordinary capability caller direct
mutation authority.

### Capability surface

Add only these mutation capabilities to the separate general-ledger catalog:

```text
events.post
events.reverse
```

A corrected replacement uses `events.post` with balanced postings and a typed
`replaces` lineage link. Do not add a second replacement implementation.

Both definitions are mutations with `confirmation_required` agent access.
Calling either through ordinary `invoke` decodes and authorizes the exact input,
records a pending attempt, and returns a typed confirmation request without
executing the kernel mutation.

### Confirmation contract

- Pending confirmation state is owned by the gateway runtime and kept in
  memory for this phase.
- A request binds one application-owned confirmation ID to the capability name,
  decoded input, trusted actor ID, and active ledger ID.
- The displayed request contains an immutable serialized preview, never the
  mutable object retained for later execution.
- Approval and rejection are trusted gateway methods, not capabilities and not
  projected as model tools or guest SDK calls.
- Approval accepts only the confirmation ID. The gateway executes the stored
  capability and stored decoded input; the caller cannot provide replacement
  arguments.
- Approval consumes the pending request atomically, rechecks trusted context and
  capability authorization, executes once, validates output, and settles the
  structured attempt.
- Rejection consumes the pending request, settles it as rejected, and performs
  no domain mutation.
- A consumed, unknown, or replayed confirmation ID fails closed.
- Confirmation does not weaken kernel validation, account permissions,
  idempotency, provenance, balance, lineage, or append-only behavior.

### Required tests and evidence

- Unconfirmed and rejected posting/reversal requests append nothing.
- Approval posts the exact decoded event and uses trusted actor, ledger, and
  recorded time.
- Approval cannot be reused and cannot authorize a separately proposed input.
- Authorization is evaluated when the request is created and again immediately
  before execution.
- Missing ledger authority, inaccessible accounts, invalid postings, duplicate
  idempotency keys, and invalid reversal targets fail without partial state.
- An approved reversal exactly negates the original event and keeps lineage.
- An approved balanced replacement can follow a reversal and links to the
  original event without rewriting history.
- Pending, approved, rejected, refused, and failed outcomes remain inspectable
  through structured capability attempts without raw source contents.
- One deterministic CLI command demonstrates pending, rejected, approved post,
  approved reversal, and approved replacement behavior.
- All Phase 11 reads and the legacy tool/code evaluation remain unchanged and
  passing.

### Expected files

```text
packages/capability/src/capability.ts
packages/capability/src/gateway.ts
packages/capability/src/general-ledger-capabilities.ts
packages/capability/src/confirmation.test.ts
packages/capability/src/index.ts
apps/cli/src/confirm-general-ledger.ts
```

### Non-goals

- No proposal mutation capability or arbitrary lineage/link mutation.
- No durable confirmation storage, expiry policy, distributed continuation, or
  instruction-level sandbox suspension.
- No Pi prompt, tool projection, generated SDK, or code-mode continuation
  change.
- No removal or extension of the legacy transaction catalog.
- No persistence, ingestion, interest, UI, deployment, or new workspace
  package.

### Verification

```sh
pnpm check
pnpm start
pnpm demo:ledger-read
pnpm demo:ledger-confirmation
pnpm eval:july-list
```

**Exit condition:** posting, reversal, and replacement can occur only after a
trusted, exact-input-bound confirmation; rejection and replay produce no state
change; confirmation attempts are structured and inspectable; and every prior
read, sandbox, agent, and evaluation check remains passing.

Phase 12 added runtime-owned, single-use confirmation IDs, immutable serialized
previews, private decoded inputs, trusted context binding, authorization recheck,
atomic approval/rejection, confirmed posting and reversal capabilities, linked
replacement through the post contract, structured settlement evidence, and a
deterministic CLI demonstration. Agent and guest-code projections remain on the
legacy catalog.

## Phase 13 — Add the general-ledger Pi tool-mode baseline

Project the earned general-ledger catalog into Pi Agent Core without changing
the code-mode SDK or granting the model trusted confirmation authority. This
phase establishes the tool-mode baseline that later general-ledger code-mode
work must match.

### Visible tool catalog

Add a separate tool projection for exactly these capabilities:

```text
accounts.list          -> accounts_list
events.get             -> events_get
events.query           -> events_query
reports.balance        -> reports_balance
reports.activity       -> reports_activity
reports.trial_balance  -> reports_trial_balance
events.post            -> events_post
events.reverse         -> events_reverse
```

Every tool uses a closed TypeBox input schema and sequential execution. The
projection forwards decoded model arguments to the common capability gateway;
it owns no ledger validation, authorization, confirmation state, or domain
behavior. Only capabilities present in the supplied gateway are projected.

Keep the existing legacy transaction and code-mode projections intact. Agent
runs select the legacy `tool`, `general_ledger`, or `code` mode explicitly; the
default remains legacy `tool` mode during this phase.

### Confirmation presentation

- A successful read returns a structured `succeeded` tool result with the
  capability output.
- `events.post` and `events.reverse` return a structured
  `confirmation_required` tool result containing the immutable confirmation
  request produced by the gateway.
- A pending confirmation is not reported as an executed mutation and remains
  visible through the gateway attempt log.
- `confirm` and `reject` are application controls. They are never Pi tools and
  are not described as model-callable operations in the system prompt.
- Tool cancellation propagates Pi's abort signal into the gateway Effect.

### Agent controls and trace

Keep one Pi Agent Core loop per run and sequential outer-tool execution. Expose
only a narrow run control to the composition root:

- queue one steering message;
- queue one follow-up message;
- abort the active run.

Continue translating streamed text and tool start/end lifecycle events into
application-owned agent events. The deterministic composition root records the
agent event stream beside the gateway's structured capability attempts; these
two ordered records are the Phase 13 tool execution trace. Do not add a trace
package until a second application consumer needs a shared trace vocabulary.

### Deterministic reconciliation task

Add one API-key-free faux-provider conversation for this exact request:

> Reconcile July 2026. Report the posted event count, expense total in minor
> units, and whether the trial balance is zero at the start of August.

The faux model calls `events.query`, `reports.activity`, and
`reports.trial_balance` in one assistant turn. Pi executes them sequentially
through the real general-ledger gateway and the model produces this stable
answer from tool results:

```text
July 2026 reconciled: 4 posted events, 6249 expense minor units, trial balance zero: yes.
```

The CLI prints the prompt, assistant answer, ordered agent events, and ordered
capability attempts.

### Required tests and evidence

- The general-ledger projection exposes exactly the eight named tools, all as
  sequential tools with closed parameter schemas.
- Each projected read reaches its matching capability through the common
  gateway and returns a structured successful result.
- A projected mutation returns the exact safe pending confirmation request,
  appends no event, and exposes no approve or reject tool.
- The deterministic reconciliation completes through Pi Agent Core and the
  real kernel/gateway without an API key, with three sequential calls and the
  exact stable answer.
- Agent tool lifecycle events and capability attempts preserve call order.
- A queued steering message is observed by the next model turn.
- Aborting a run produces an aborted result and does not leave the agent
  running.
- The legacy tool projection, code-mode proof, paired July evaluation, direct
  general-ledger reads, and confirmation demo remain unchanged and passing.

### Expected files

```text
packages/pi-adapter/src/agent.ts
packages/pi-adapter/src/general-ledger-tools.ts
packages/pi-adapter/src/general-ledger-tools.test.ts
packages/pi-adapter/src/index.ts
apps/cli/src/reconcile-general-ledger.ts
apps/cli/package.json
package.json
README.md
```

### Non-goals

- No model-callable confirmation approval or rejection.
- No automatic confirmation, durable continuation, confirmation expiry, or
  instruction-level suspension.
- No change to the general-ledger capability implementations or kernel rules.
- No general-ledger code-mode SDK, discovery migration, or projection
  equivalence evaluation yet.
- No removal of the legacy transaction catalog, legacy CLI, or paired July
  evaluation.
- No persistence, ingestion, interest policy, UI, deployment, or new workspace
  package.

### Verification

```sh
pnpm check
pnpm start
pnpm demo:ledger-read
pnpm demo:ledger-confirmation
pnpm demo:ledger-agent
pnpm eval:july-list
```

**Exit condition:** the exact general-ledger catalog runs as sequential Pi
tools; pending confirmation is presented without exposing trusted controls; a
deterministic multi-tool reconciliation produces ordered agent and capability
evidence; steering and cancellation are proven; and every prior direct,
agent, code-mode, sandbox, and evaluation check remains passing.

Phase 13 added the separate eight-tool general-ledger projection, structured
successful and pending-confirmation tool results, narrow steering, follow-up,
and abort controls, ordered agent/capability evidence, and an API-key-free July
reconciliation through Pi Agent Core. Trusted approval and rejection remain
gateway-only, while the legacy tool and code-mode projections remain unchanged.

## Phase 14 — Build the coherent human-application baseline

Add the first browser application only after the CLI has proved the common
general-ledger boundary. The application must be useful without an agent and
must not bypass the capability gateway for financial reads or mutations.

### Workspace and runtime boundary

Add one `apps/personal-ledger` workspace using TanStack Start with file-based
TanStack Router routes, TanStack Query for server-state caching and invalidation,
TanStack Form for decoded human mutation forms, and Astryx components and
neutral theme tokens. Do not add a shared web, API, runtime, or UI package.

The server owns one long-lived in-memory Effect runtime containing the fixture
ledger, trusted session, and personal-ledger capability gateway. Browser input
never supplies actor ID, ledger ID, readable accounts, mutable accounts, or
confirmation authority. Typed TanStack Start server functions invoke named
application methods; the browser is not given a generic capability or kernel
endpoint. Same-origin server-function protections remain enabled.

Use exact pinned React, TanStack, Astryx, Vite, and Playwright dependencies.
Keep the application local-only and deterministic; no cloud deployment,
authentication system, or database is introduced in this phase.

### Personal-ledger capability catalog

Add one application-earned read capability:

```text
proposals.query
```

It accepts a closed empty input, returns only readable proposals from the active
ledger, and uses the same validation, trusted authorization, output decoding,
and structured-attempt path as every other capability. Compose it with the
existing eight-operation general-ledger catalog as a separate
`personalLedgerCapabilities` catalog. Do not change the Phase 13 Pi tool
projection or the legacy/code-mode catalogs.

Proposal review is read-only in this phase. A proposal remains an immutable
candidate with explicit assumptions and never affects balances. Do not invent
proposal acceptance, rejection, status, or deletion semantics.

### Server-function surface

Expose only these typed application functions:

```text
getDashboard({ from, to, at })
queryEvents({ from, to })
getEvent({ eventId })
queryProposals()
getPendingConfirmations()
getAttempts()
requestExpense(input)
requestReversal({ eventId, requestId })
confirmMutation({ confirmationId })
rejectMutation({ confirmationId })
resetLedger()
```

The dashboard function composes `accounts.list`, `reports.activity`,
`reports.balance`, and `reports.trial_balance` through the gateway. Event and
proposal routes invoke their matching read capability.

`requestExpense` accepts only a client request ID, effective ISO
timestamp, positive safe-integer minor-unit amount, expense account ID, funding
account ID, and non-empty note. The trusted server maps that narrow human form
to one balanced USD `events.post` input with deterministic manual provenance.

The reversal request accepts only an event ID and client request ID. It maps to
`events.reverse`. Both mutation request functions return the exact pending
confirmation request and append nothing.
Confirmation accepts the route confirmation ID only; the caller cannot replace
the stored capability input. Rejection and replay fail closed.

Decode every server-function input before invoking the gateway, reject
unexpected fields, and return small stable error codes without schema internals,
raw request contents, or trusted context.

### Human interface

Build four connected surfaces in one responsive application:

1. **Dashboard** — readable account balances, July expense total, posted-event
   count, and zero/non-zero trial-balance status.
2. **Event journal** — date-filtered events with kind, effective time, posting
   count, amount, and visible reversal/replacement lineage.
3. **Event detail** — postings, actor, effective/recorded times, provenance, and
   lineage, plus a request-reversal action.
4. **Review** — immutable proposals and assumptions, an expense request form,
   pending confirmation previews, and trusted confirm/reject controls.

The UI must clearly distinguish posted events, unposted proposals, pending
confirmations, rejected requests, and completed mutations. It may format minor
units for display, but displayed arithmetic is not authoritative and must come
from kernel report output.

Do not add the agent conversation, generated-code viewer, tool/code selector,
comparative metrics, or trace inspector yet; those belong to the later visual
comparison milestone.

### Deterministic reset

`resetLedger` is a trusted application control, not a capability. It
disposes the current managed runtime and recreates it from the checked-in
fixtures and trusted session. Reset must restore:

- the original ten readable accounts;
- events `evt_001` through `evt_010` only;
- the original ambiguous proposal;
- no pending confirmations;
- a fresh structured-attempt log;
- the July expense total of `6_249` minor units and zero trial balance at
  `2026-08-01T00:00:00.000Z`.

### Required tests and evidence

- `proposals.query` rejects unexpected input, filters by trusted ledger/account
  access, validates output, and records structured attempts.
- Server integration tests prove every function uses the long-lived gateway,
  rejects malformed input, and never exposes inaccessible ledger data.
- The deterministic dashboard returns ten accounts, four July posted events,
  `6_249` expense minor units, and a zero trial balance.
- The journal and detail routes expose postings, provenance, and lineage.
- The proposal is visible with its assumption and never changes report totals.
- An expense request and reversal append nothing before confirmation.
- Rejection appends nothing; confirmation appends exactly once; replay fails;
  and structured attempts show the settled outcome.
- Reset after confirmed mutations restores the exact fixture state and clears
  confirmation and attempt state.
- A deterministic browser scenario covers dashboard, journal/detail, proposal
  review, rejected expense, confirmed expense, confirmed reversal, and reset.
- The responsive application is visually inspected at desktop and narrow
  viewport sizes.
- Every Phase 1–13 CLI, agent, code-mode, evaluation, and sandbox check remains
  passing.

### Expected files

```text
apps/personal-ledger/
  package.json
  tsconfig.json
  vite.config.ts
  playwright.config.ts
  src/
    router.tsx
    routeTree.gen.ts
    routes/__root.tsx
    routes/index.tsx
    ledger/application.server.ts
    ledger/functions.ts
    ledger/contracts.ts
    server.test.ts
    styles.css
  e2e/personal-ledger.spec.ts
packages/capability/src/general-ledger-capabilities.ts
packages/capability/src/general-ledger-capabilities.test.ts
packages/capability/src/gateway.ts
packages/capability/src/index.ts
pnpm-workspace.yaml
package.json
README.md
.github/workflows/ci.yml
```

### Non-goals

- No agent conversation UI, tool/code selector, generated program, trace
  inspector, or comparative metrics.
- No proposal lifecycle mutation or automatic proposal posting.
- No generic browser capability endpoint and no browser-owned trusted context.
- No persistence, migrations, authentication, multiple interactive users,
  cloud deployment, or production-security claim.
- No ingestion, interest policy, multi-currency, valuation, or new shared
  package.
- No general-ledger code-mode migration or legacy-catalog removal.

### Verification

```sh
pnpm check
pnpm build:personal-ledger
pnpm test:e2e
pnpm start
pnpm demo:ledger-read
pnpm demo:ledger-confirmation
pnpm demo:ledger-agent
pnpm eval:july-list
```

**Exit condition:** a reviewer can run the local application, inspect the
fixture ledger and proposal, request and explicitly confirm or reject exact
expense/reversal inputs, and reset to identical fixture state; every financial
operation crosses the application-owned capability gateway; deterministic API
and browser evidence passes; and every prior repository check remains green.

Phase 14 added the TanStack Start personal-ledger application, Astryx-based
dashboard, journal, detail, and proposal-review surfaces, trusted expense and
reversal confirmation controls, deterministic reset behavior, and browser and
server integration evidence. The application keeps financial reads and
mutations behind the personal-ledger capability gateway and leaves the legacy
code-mode catalog unchanged.

## Packages that must earn their existence

| Package | Add when |
| --- | --- |
| `@bound/capability` | Three existing operations need one validated and authorized invocation path. |
| `@bound/pi-adapter` | The capability boundary is tested and ready for an agent surface. |
| `@bound/trace` | A second execution surface needs the same trace vocabulary. |
| `@bound/code-mode` | The sandbox ADR passes its decision gate. |
| `@bound/testing` | Two packages genuinely share fixtures or test runtime construction. |
| Policy package | At least two consumers need the same effective-dated policy behavior after the posting kernel is stable. |
| Database package | In-memory behavior is stable and persistence is the next demonstrated requirement. |
| Web application | The CLI demonstrates the full three-capability agent path. |

## Immediate next task

Document Phase 15 before changing code. The next boundary is the controlled
general-ledger code-mode migration from Milestone 4: regenerate the bounded app
proxy and compact declarations for the earned general-ledger catalog, add
capability discovery, route every guest SDK call through the gateway, replace
the legacy July-list evaluation, and re-run projection, sandbox, and resource
limit evidence. Do not remove the legacy transaction surface or begin the
visual comparison UI until the successor catalog, equivalence tests, migration
criteria, and exit condition are written here.
