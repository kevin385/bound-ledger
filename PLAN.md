# Bound Ledger — Research, Product Direction, and Portfolio Plan

## Status

This document is the research thesis, target architecture, portfolio release
contract, and evidence-gated long-term product direction. The phase order in
[`docs/INITIAL_PLAN.md`](docs/INITIAL_PLAN.md) is authoritative for current
implementation work.

The product and repository are named **Bound Ledger**. Workspace packages keep
the `@bound/*` namespace.

Implementation status: Phase 15 is complete; Phase 16 is fully specified in
`docs/INITIAL_PLAN.md` and is the next code boundary.

> Let agents code inside your application—without coding around its rules.

The current repository is pre-alpha local research software with deterministic
fixtures. The possible product direction is an open-source, self-hostable,
model-agnostic personal-finance assistant. That direction is not a claim that
persistence, real-data ingestion, model selection, bank connectivity, or a
production security boundary exists today.

Bound Ledger is a clean-room implementation. External systems may be consulted
for architectural lessons and documented failure modes, but their
implementation code, private naming, schemas, tests, prompts, and product
abstractions do not belong in this repository. Pi Agent Core is an
implementation dependency for the agent loop, not the product identity or
source of application authority.

## 1. Project thesis

Build and evaluate a controlled code-mode architecture for AI-native applications.

The reference application exposes its own typed business capabilities through two interchangeable orchestration modes:

1. **Tool mode:** the model sees and invokes individual tools.
2. **Code mode:** the model writes a small JavaScript program against a generated, typed application SDK.

Both modes must cross the same capability gateway and therefore share
validation, trusted context, authorization, append-only ledger behavior,
deterministic projections, and execution evidence.

The project tests this claim rather than assuming it:

> For applications with many composable operations, code mode can reduce tool-selection overhead and model turns without allowing generated code to bypass application rules.

Negative or mixed findings are valid outcomes.

## 2. Portfolio story

The finished repository should demonstrate:

- an embedded agent loop using Pi Agent Core;
- an application-owned capability model;
- automatic projection into tool mode and a code-mode SDK;
- a restricted JavaScript execution environment;
- one authorization and validation boundary for both modes;
- a polished reference application;
- structured execution traces;
- an evaluation suite comparing correctness, cost, latency, and safety;
- architecture and threat-model documentation;
- honest published findings.

The concise portfolio description is:

> I built Bound Ledger, a controlled code-mode personal financial ledger where
> an AI can interpret inputs and program against a typed SDK, while every posted
> event remains balanced, append-only, authorized, and calculated by
> deterministic application code.

Do not position the initial release as a production-ready general agent framework.

### Long-term product direction

If the portfolio release and user validation justify continued investment,
Bound Ledger may evolve into:

> An open-source, self-hostable personal-finance workspace where people can use
> a local or hosted model to analyze financial evidence and propose exact
> operations, while deterministic ledger code, application authorization, and
> explicit human confirmation remain the authority.

This is not a generic "chat with transactions" product. Its intended wedge is
governed financial agency:

- source records remain distinguishable from interpreted proposals;
- proposals and assumptions remain distinguishable from posted facts;
- the model may search, explain, reconcile, and prepare corrections;
- deterministic application code calculates balances and validates postings;
- consequential operations bind approval to exact decoded inputs;
- every attempted and completed operation is attributable and inspectable;
- changing the model provider does not change domain or authorization rules.

The reference user outcome is a trustworthy monthly reconciliation:

1. import a bounded source such as CSV or OFX/QFX;
2. identify transfers, expenses, refunds, duplicates, and ambiguous records;
3. show evidence and explicit assumptions;
4. prepare exact balanced corrections;
5. let the user confirm or reject each consequential operation;
6. preserve an append-only audit trail of proposals, decisions, and posted
   events.

### Open-source and model-choice principles

- Apache-2.0 source remains the default distribution shape unless an explicit
  evidence-backed licensing decision changes it.
- A useful local workflow must not require a hosted Bound Ledger service.
- Deterministic tests and manual ledger workflows must not require any model.
- Model integration belongs behind a small provider-neutral adapter contract;
  no provider becomes the source of application identity or financial truth.
- Local and OpenAI-compatible endpoints are product goals, not current
  features. Native provider adapters are added only when their streaming,
  cancellation, structured-output, tool-use, and usage semantics are tested.
- Users choose what data may leave their machine. Remote-model calls must
  disclose the provider and data scope before transmission and minimize the
  source data placed in model context.
- Provider conformance tests must cover streaming text, tool calls, abort,
  malformed output, usage reporting, unavailable capabilities, and models that
  cannot reliably use code mode.
- Tool mode remains a supported fallback. Bring-your-own-model must not mean
  every model is assumed to support generated-code orchestration safely.

### Product evidence gates

Do not turn the possible direction into an unbounded finance-suite roadmap.
Continue beyond the portfolio release only when a narrow reconciliation
workflow demonstrates real use:

- at least ten target users attempt the workflow;
- after a separately planned security-reviewed import phase permits it,
  several users import their own sanitized or real records under an appropriate
  pre-alpha disclosure;
- at least three users return for another reporting period;
- users understand and value the distinction between proposed and posted;
- the workflow saves meaningful review time without allowing incorrect or
  unauthorized postings;
- users value auditability, self-hosting, or model choice rather than only a
  free dashboard.

If users want only read-only questions such as category totals, integrate with
or contribute to an established finance system rather than recreating its
budgeting, sync, mobile, and reporting surface. If the governed reconciliation
workflow is valuable, grow outward from that workflow instead of cloning a
general consumer-finance application.

## 3. Reference application: Personal Financial Ledger

Build a small, polished personal financial ledger. It must work coherently
without the agent so the AI operates a real financial system rather than a
synthetic tool benchmark or an expense tracker with ledger terminology.

Notes, CSV rows, manual forms, bank exports, and AI conversations are input
sources. They may propose financial events, but they are not separate sources
of financial truth. Only validated, posted events affect balances.

### Input and posting flow

```text
source record
    ↓
event proposal + explicit assumptions
    ↓
validation, authorization, and confirmation
    ↓
immutable financial event + balanced postings
    ↓
balances, activity, expenses, owed amounts, and other projections
    ↓
human and AI interfaces
```

Raw source evidence and interpretation remain distinguishable from posted
financial facts. Ambiguous proposals never affect balances until the missing
economic facts are resolved or explicitly confirmed.

### Central model

- **Ledger** — one financial context or account group and its authorization
  boundary.
- **Account** — an account with an accounting class (`asset`, `liability`,
  `equity`, `income`, or `expense`) and a product subtype such as cash, bank,
  credit card, loan, receivable, investment, expense category, or income source.
- **Event proposal** — an interpreted but unposted candidate with assumptions,
  confidence, rationale, and source evidence.
- **Financial event** — an immutable posted fact such as a deposit, withdrawal,
  expense, transfer, refund, contribution, interest accrual, or adjustment.
- **Posting** — one signed, fixed-precision effect on one account. Every posted
  event balances across its postings, independently per currency.
- **Policy** — an effective-dated deterministic rule such as an interest rate,
  compounding schedule, date basis, rounding rule, or repayment rule.
- **Projection** — a derived balance, activity view, expense summary, owed
  amount, or report. Projections are never an independent mutation surface.

The initial kernel is single-currency and stores amounts in integer minor
units. Reporting periods are derived from an event's effective timestamp;
`month` is not a domain field. Transfers net to zero across accounts. An expense
may reduce an asset or increase a liability, while a cash withdrawal may be a
transfer rather than an expense.

Financial corrections append a linked reversal and, when needed, a replacement
event. Non-financial classification corrections append a typed superseding
assertion. Neither silently rewrites history.

Every proposal and posted event carries audit provenance: actor, source kind,
source reference, recorded time, effective time, correlation/causation links,
and an idempotency key. Raw source contents are retained only where explicitly
required and must not leak through errors or traces.

### Human-facing behavior

- View account balances and activity over a date range.
- Inspect an event, its postings, source provenance, assumptions, and history.
- Record deposits, withdrawals, expenses, transfers, refunds, and
  contributions.
- Review proposals before they become posted financial events.
- Reverse or correct events without erasing prior history.
- Distinguish expenses from transfers and liability changes.
- Preview deterministic reports and, later, policy-driven interest accruals.
- Confirm or reject agent-proposed postings and corrections.
- View agent activity and the exact financial events it caused.
- Import deterministic fixtures and, only after the kernel is stable, add
  source-specific ingestion adapters.

### Explicit MVP boundaries

Do not add live bank connections, payment initiation, receipt OCR, tax advice,
financial recommendations, foreign exchange, security lots, market-price
valuation, or automated trading. The kernel begins in memory with one currency
and deterministic fixtures. It records financial facts but never moves money.

For the possible product direction, deterministic CSV and OFX/QFX import comes
before any bank aggregator. A later bank connection is read-only ingestion: it
may create source records and proposals but must not post facts directly or
initiate payments. Tax, investment, lending, or personalized financial advice
requires a separate product, legal, safety, and jurisdictional decision; it is
not implied by the personal-ledger roadmap.

### Seed data

Create deterministic fixtures with:

- 1 primary personal ledger and 1 inaccessible ledger for authorization tests;
- asset, liability, equity, income, and expense accounts;
- checking, credit-card, cash, loan, and receivable subtypes;
- deposits, contributions, transfers, withdrawals, expenses, refunds, and
  adjustments spanning at least four months;
- an expense paid from checking and an expense charged to a credit liability;
- a bank-to-cash withdrawal that is not classified as an expense;
- one complete reversal/replacement chain;
- duplicate idempotency keys and an unbalanced event for rejection tests;
- ambiguous proposals that do not affect balances;
- two actors with different ledger and account permissions.

Seed data must be reproducible from one command and contain no real personal
financial information.

### Target capabilities

```text
accounts.list
accounts.get

events.propose
events.post
events.get
events.query
events.reverse
events.link

reports.balance
reports.activity
reports.trial_balance
reports.expenses

policies.list
interest.preview
interest.accrue
```

`events.link` accepts only declared relationship types such as `reverses`,
`replaces`, `supersedes`, or `derived_from`; it is not an arbitrary graph
mutation. Interest capabilities arrive only after the core posting invariants
are stable. Begin with the smallest existing operations and grow the catalog
only when a human workflow or evaluation task needs them.

## 4. Flagship demonstration

The user asks:

> Reconcile last month's activity across my checking account, credit card, and
> loan. Show balances, expenses, transfers, refunds, ambiguous entries, and the
> interest that would accrue under the active policy. Propose exact corrections
> with their postings and assumptions, but do not post anything until I approve.

### Tool-mode execution

Pi Agent Core receives one `AgentTool` for each capability visible to the current user and session.

### Code-mode execution

Pi Agent Core receives a small tool set:

```text
inspect_capabilities
execute_code
ask_user
finish
```

The generated program may resemble:

```ts
const activity = await app.reports.activity({
  from: "2026-07-01T00:00:00Z",
  to: "2026-08-01T00:00:00Z",
  accountIds: ["acct_checking", "acct_credit", "acct_loan"],
});

const balances = await app.reports.balance({
  at: "2026-08-01T00:00:00Z",
});

const trialBalance = await app.reports.trialBalance({
  at: "2026-08-01T00:00:00Z",
});

const proposals = await app.events.query({
  status: "proposed",
  from: "2026-07-01T00:00:00Z",
  to: "2026-08-01T00:00:00Z",
});

const interest = await app.interest.preview({
  accountId: "acct_loan",
  through: "2026-07-31T23:59:59Z",
});

const ambiguous = proposals.items.filter(
  (proposal) => proposal.assumptions.length > 0,
);

return {
  balances,
  trialBalance,
  expenses: activity.expenses,
  transfers: activity.transfers,
  refunds: activity.refunds,
  ambiguous,
  interestPreview: interest,
  proposedCorrections: activity.correctionCandidates,
};
```

This first program is read-only and returns an inspectable proposal. The trial
balance is a deterministic integrity assertion over posted events. After the
user approves exact inputs, Pi generates a continuation that invokes
`events.reverse`, `events.post`, or `interest.accrue`. The gateway binds
confirmation to decoded mutation inputs; approval is not blanket permission
for later calls.

### Demo UI

```text
┌───────────────────────────┬───────────────────────────┐
│ Personal Financial Ledger │ Agent conversation        │
│                           │                           │
│ Dashboard and ledger      │ Request, progress, result │
├───────────────────────────┼───────────────────────────┤
│ Generated program         │ Execution trace           │
│                           │                           │
│ Code or tool sequence     │ Calls, refusals, metrics  │
└───────────────────────────┴───────────────────────────┘
```

Include a visible mode selector:

```text
○ Tool mode
● Code mode
```

The same task and application state can be reset and run through either mode.

## 5. Research questions

The project must answer, with measurements:

1. Does code mode reduce model-visible schema tokens as capability count grows?
2. Does it reduce model turns for multi-step tasks?
3. Does ordinary JavaScript improve filtering, aggregation, and loops?
4. Does code mode improve or harm task completion accuracy?
5. How often does generated code fail syntactically or at runtime?
6. Can per-capability authorization remain enforceable inside one outer code tool?
7. Are code-mode traces easier or harder to understand than tool-call traces?
8. What sandbox restrictions are necessary to prevent bypass?
9. At what catalog size does code mode become useful?
10. What developer work is required to add one capability to both modes?

## 6. Architecture

```text
User request
    ↓
Pi Agent Core
    ↓
Execution mode
    ├── tool mode → projected AgentTool[] ──────┐
    └── code mode → execute_code → sandbox     │
                                  ↓             │
                            generated app SDK ──┤
                                                ↓
                                      capability gateway
                                                ↓
                                validation + trusted context
                                      + authorization
                                                ↓
                                deterministic ledger kernel
                                                ↓
                                          application DB
```

The mode changes orchestration only. It must not change domain behavior or authority.

### Possible product deployment shape

This is a post-validation target, not the current in-memory runtime:

```text
manual entry / CSV / OFX-QFX / read-only connector
                       ↓
            source evidence + import identity
                       ↓
             proposal and assumption layer
                       ↓
human UI ───────> application capability gateway <────── Pi agent loop
   │                    ↓                    ↑                 ↑
   │        validation + authorization      │          chosen model
   │             + exact confirmation       │       local or explicitly
   │                    ↓                    │        configured remote
   └────────> deterministic ledger kernel ──┘
                        ↓
          local persistent append-only store
                        ↓
        projections, audit trace, backup/export
```

Source connectors and models are replaceable inputs. Neither receives database
authority. A connector creates source records; a model creates interpretations
and capability requests; only the application gateway and deterministic kernel
can turn approved input into posted financial facts.

## 7. Architectural invariants

### I1. One capability implementation

Tool mode and code mode adapt the same capability definition. Neither projection owns business behavior.

### I2. Generated code has no direct authority

The sandbox cannot access the database, domain services, credentials, filesystem, process, network, dynamic imports, or host environment.

### I3. Every `app.*` call crosses the gateway

The generated SDK is a proxy. It does not expose feature implementations directly.

### I4. Model input cannot manufacture identity

Actor, ledger and account access, and confirmation permissions come from trusted session context, never tool or code arguments.

### I5. Validate on both sides

Decode capability input before authorization and execution. Decode successful output before it returns to the model or becomes trace state.

### I6. Authorization is per invocation

One authorized call does not grant authority to subsequent calls in the same generated program.

### I7. Mutation semantics are explicit

Each capability declares whether it is a read, reversible mutation, confirmed mutation, or forbidden to agents.

### I8. The sandbox is bounded

Enforce wall-clock, CPU/instruction, memory, output-size, capability-call, mutation-call, and recursion limits.

### I9. Execution evidence is structured

Store program text, tool calls, individual capability invocations, decisions, outputs, refusals, timing, and usage separately from the model's narration.

### I10. Evaluations are reproducible

Every evaluation begins from a named deterministic fixture and records model, mode, configuration, application revision, and task version.

### I11. Posted financial history is append-only

No capability edits or deletes a posted event. Economic corrections append a
linked reversal and replacement; non-economic corrections append a typed
superseding assertion.

### I12. The ledger, not the model, calculates financial truth

Only deterministic domain code validates posting balance, applies policies,
derives balances, and calculates reports. AI may interpret sources and
orchestrate capabilities, but its narration and arithmetic are never
authoritative financial state.

### I13. Model choice does not change authority

A local model, hosted provider, deterministic fake, or no model at all uses the
same application capabilities and confirmation rules. Provider credentials,
endpoint configuration, and data-disclosure choices remain trusted application
configuration and never enter generated code.

### I14. Imported evidence is not a posted fact

A file row, statement item, connector record, extracted receipt field, or model
interpretation may create source evidence or a proposal. It cannot affect
balances until the application validates and posts an exact balanced event.

## 8. Capability authoring API

Start with the smallest API that supports the reference application:

```ts
const postEvent = defineCapability({
  name: "events.post",
  description: "Post one approved balanced financial event",
  kind: "mutation",
  agentAccess: "confirmation_required",
  input: PostEventInput,
  output: FinancialEvent,

  authorize: ({ actor, input }) =>
    input.postings.every((posting) =>
      actor.mutableAccountIds.includes(posting.accountId),
    ),

  execute: ({ input, services }) => services.ledger.postEvent(input),
});
```

A capability requires:

- globally unique name;
- concise description;
- input and output schema;
- read/mutation kind;
- agent access classification;
- authorization function;
- execution function.

Append capabilities require a stable idempotency key and source provenance from
their first version because duplicate source processing would create incorrect
balances. Add broader contract versioning only when persistence or a real
migration requires it. Do not reproduce another system's full contract
preemptively.

## 9. Projections

### Tool-mode projection

Convert each visible capability into a Pi `AgentTool`:

```ts
const tools = projectCapabilityTools({
  registry,
  session,
  invoke: capabilityGateway.invoke,
});
```

Projection owns only:

- model-facing name and description;
- TypeBox-compatible parameter schema;
- progress/result formatting;
- forwarding to the gateway.

### Code-mode projection

Generate:

- a runtime `app` proxy;
- TypeScript declaration text;
- compact feature and capability documentation;
- progressive discovery responses;
- serializable values safe to cross the sandbox boundary.

Example:

```ts
interface LedgerCapabilities {
  accounts: {
    list(input: ListAccountsInput): Promise<ListAccountsOutput>;
  };
  events: {
    query(input: QueryEventsInput): Promise<QueryEventsOutput>;
    post(input: PostEventInput): Promise<FinancialEvent>;
    reverse(input: ReverseEventInput): Promise<FinancialEvent>;
  };
  reports: {
    balance(input: BalanceReportInput): Promise<BalanceReport>;
    activity(input: ActivityReportInput): Promise<ActivityReport>;
  };
}
```

Do not give the model the entire declaration catalog on every turn. Measure progressive discovery against eager inclusion.

## 10. Pi Agent Core integration

Use the current package:

```text
@earendil-works/pi-agent-core
```

Pi Agent Core owns:

- agent turns;
- model streaming;
- message state;
- tool execution;
- event streaming;
- steering and follow-up;
- model-provider integration through Pi AI.

This project owns:

- application context;
- capability registry;
- tool and code projections;
- sandbox;
- authorization;
- confirmation workflow;
- application persistence;
- traces and evaluation records.

### Future provider boundary

Pi AI is the current model-facing dependency, but the product identity is not
tied to one provider or model family. After the deterministic general-ledger
tool/code comparison is complete, earn the smallest application-level provider
configuration that can describe:

```ts
interface ModelConfiguration {
  id: string;
  provider: string;
  model: string;
  endpointKind: "native" | "openai_compatible" | "local";
  supportsTools: boolean;
  supportsCodeMode: boolean;
}
```

Secrets, base URLs, actor identity, data-disclosure choices, and authorization
never enter model arguments or generated code. The adapter must normalize
streaming, cancellation, tool calls, structured failures, and usage evidence,
while preserving provider-specific limitations rather than pretending all
models are equivalent. Provider configuration belongs at an application
composition root until at least two real applications need a shared package.

Use `beforeToolCall` to restrict access to outer agent tools. Do not mistake this for per-capability enforcement inside `execute_code`; that enforcement belongs in the capability gateway.

Use sequential execution for the code tool initially. Introduce parallel outer tool execution only after correctness tests exist.

## 11. Code sandbox contract

### Available globals

```ts
{
  app,
  dates,
  collections,
  output,
}
```

Keep helpers small and deterministic.

### Unavailable globals

```text
fetch
XMLHttpRequest
WebSocket
process
require
module loading
filesystem
environment variables
database clients
timers
child processes
host object prototypes
```

### Limits

- wall-clock timeout;
- CPU or instruction budget;
- memory ceiling;
- maximum program size;
- maximum result size;
- maximum total capability calls;
- maximum mutation calls;
- abort propagation;
- serializable input and output only.

### Threats to test

- prototype escape;
- constructor escape;
- dynamic import;
- indirect `eval`;
- infinite loop;
- large allocation;
- output flooding;
- recursive SDK calls;
- hidden network access;
- object capability leakage;
- retention of host references;
- unauthorized resource identifiers;
- mutation after session authority changes.

Choose a sandbox implementation only after a short spike comparing isolation properties. Do not implement a security sandbox with raw `eval`, `Function`, or Node `vm` and call it safe.

## 12. Confirmation behavior

Keep the first version simple:

| Access classification   | Agent behavior                       |
| ----------------------- | ------------------------------------ |
| `read`                  | Execute immediately                  |
| `mutation`              | Execute and record                   |
| `confirmation_required` | Return a pending confirmation result |
| `forbidden`             | Reject                               |

When code mode encounters a pending confirmation:

1. Stop or suspend the generated program at a defined boundary.
2. Present the exact capability and decoded input.
3. Let the user approve or reject.
4. Continue only through a runtime-owned continuation mechanism.

For the MVP, it is acceptable to stop the program and ask Pi to generate a continuation after approval. Durable instruction-level suspension is not required initially.

## 13. Structured trace

One run should record:

```text
run
├── request
├── mode
├── model and configuration
├── planner messages
├── generated program or tool sequence
├── capability attempts
│   ├── decoded input
│   ├── authorization result
│   ├── execution result or refusal
│   └── duration
├── sandbox metrics
├── model usage
├── application changes
└── final answer
```

The UI must clearly distinguish:

- what the model proposed;
- what JavaScript computed;
- what the application authorized;
- what actually changed.

## 14. Evaluation design

Create at least 20 versioned tasks.

### Category A — retrieval and synthesis

Examples:

- Reconcile opening balance, activity, and closing balance for a date range.
- Separate expenses, transfers, withdrawals, refunds, and liability changes.
- Explain an owed amount from its contributing events and postings.

### Category B — bulk deterministic work

Examples:

- Detect duplicate source references without posting duplicates.
- Validate a batch of proposed events and group failures by invariant.
- Calculate date-range balances and expense summaries across many accounts.

### Category C — multi-step composition

Examples:

- Interpret ambiguous source records, expose assumptions, and prepare proposals.
- Identify an incorrect event, construct its exact reversal and replacement,
  and prepare one approval bundle.
- Preview policy-driven interest, explain the calculation inputs, and accrue it
  only after approval.

### Category D — adversarial authority

Examples:

- Read or post events in a ledger or account the actor cannot access.
- Submit unbalanced postings, duplicate idempotency keys, or nonexistent accounts.
- Post, reverse, or accrue interest without required confirmation.
- Supply a ledger or account identifier that conflicts with the trusted session.
- Ask generated code to fetch an external URL or inspect environment variables.
- Attempt to bypass the SDK using JavaScript reflection.

### Metrics

```ts
interface EvaluationResult {
  taskVersion: number;
  fixtureVersion: number;
  mode: "tools" | "code";
  model: string;
  completed: boolean;
  correctnessScore: number;
  safetyScore: number;
  modelTurns: number;
  inputTokens: number;
  outputTokens: number;
  capabilityCalls: number;
  invalidCalls: number;
  blockedCalls: number;
  confirmations: number;
  durationMs: number;
  estimatedCost?: number;
}
```

Run each nondeterministic model/task/mode combination multiple times. Publish sample size and variance instead of presenting one favorable run.

## 15. Repository structure

```text
bound-ledger/
  apps/
    personal-ledger/        human application and agent interface

  packages/
    capability/             definitions, schemas, registry
    runtime/                trusted context and invocation gateway
    tool-mode/              AgentTool projection
    code-mode/              generated SDK and sandbox integration
    pi-adapter/             Pi Agent Core session integration
    trace/                  structured execution evidence
    testing/                fixtures, fakes, and task harness

  evals/
    tasks/                  versioned evaluation tasks
    scorers/                deterministic and model-assisted scorers
    results/                committed summaries and raw run references

  docs/
    architecture.md
    capability-model.md
    code-mode.md
    threat-model.md
    evaluation-method.md
    findings.md
    adr/
```

This is the target shape, not required scaffolding on day one. Begin with one application and extract packages only when boundaries become real.

## 16. Suggested technology

- TypeScript strict mode
- pnpm workspace
- Pi Agent Core and Pi AI
- Effect v4, including Effect Schema, for domain programs and boundary decoding
- TypeBox only where Pi Agent Core's tool schema boundary requires it
- React for the Personal Financial Ledger and inspector
- SQLite for deterministic local persistence
- an application-owned model configuration over Pi AI for tested native,
  OpenAI-compatible, and local endpoints after the provider phase is earned
- Vitest for unit and integration tests
- Playwright for flagship UI scenarios
- A sandbox technology selected through an explicit isolation spike

Avoid cloud infrastructure until the Phase 5 local CLI agent path in
`docs/INITIAL_PLAN.md` passes. A later Cloudflare proof may add a Worker only
as a composition root; it must not replace Pi Agent Core or the application
capability boundary. A reviewer must be able to run the deterministic project
without a model or API key. Later live-model demonstrations may accept a local
endpoint or an explicitly configured user-owned API key, and ordinary CI must
never require either.

## 17. Milestones

### Milestone 0 — trustworthy ledger core

- Decode account, proposal, event, posting, and provenance fixtures with Effect
  Schema.
- Model expected validation and authorization failures as typed errors.
- Add an append-only in-memory ledger service.
- Reject unbalanced, cross-ledger, unknown-account, and duplicate event input
  atomically.
- Derive balances, trial balance, and date-range activity from postings.
- Implement exact reversal/replacement lineage and prove proposals do not affect
  balances.
- Enforce ledger and account authorization without AI.

Exit condition: deterministic tests post representative personal-finance events,
derive correct balances and reports, reverse an event without rewriting history,
and prove every rejected append leaves state unchanged.

### Milestone 1 — capability boundary

- Migrate the existing capability gateway from legacy `transactions.*` behavior
  to earned `accounts.*`, `events.*`, and `reports.*` kernel operations.
- Preserve the immutable registry, trusted session separation, input/output
  validation, and per-call authorization.
- Require confirmation for posting, reversal, replacement, and later policy
  application.
- Record idempotency, provenance, lineage, and structured attempts without
  leaking raw source evidence.
- Replace the legacy July-list evaluation before removing its transaction
  capability surface.

Exit condition: the CLI and direct tests invoke the smallest general-ledger
catalog through one gateway, and the legacy transaction capability surface is
removed only after equivalent successor evidence exists.

### Milestone 2 — tool-mode baseline

- Project the visible general-ledger capabilities into Pi `AgentTool[]`.
- Add CLI conversation and event streaming.
- Test the adapter with a deterministic fake model stream.
- Test steering, cancellation, and sequential execution.
- Add tool execution traces.

Exit condition: a deterministic reconciliation request completes through Pi
Agent Core and the real general-ledger boundary without an API key.

### Milestone 3 — coherent human application

- Expand deterministic fixtures only as the application needs them.
- Implement the account dashboard, event journal, posting detail, and proposal
  review flow.
- Add deterministic reset tooling.
- Grow toward 8–10 domain operations without bypassing the capability gateway.

Exit condition: Bound Ledger is a coherent small application without requiring
the agent, and its existing operations use the common execution boundary.

### Milestone 4 — sandbox evidence and controlled code mode

- Preserve the completed sandbox threat checklist, runtime comparison, ADR, and
  executable escape/resource-limit evidence.
- Regenerate the runtime `app` proxy for the earned general-ledger catalog.
- Generate compact TypeScript declarations and discovery data.
- Implement `inspect_capabilities`.
- Reuse the bounded `execute_code` tool and serialization bridge.
- Route every SDK call through the gateway.
- Re-run escape attempts, resource limits, and projection-equivalence tests.
- Run the same five general-ledger tasks in tool and code modes.

Exit condition: code mode completes tasks without direct application access or authority bypass.

### Milestone 5 — visual comparison

- Add tool/code mode selector.
- Render generated programs.
- Render chronological capability attempts.
- Show authorization refusals and pending confirmations.
- Display tokens, turns, duration, calls, and application changes.
- Add deterministic reset and replay controls.

Exit condition: a reviewer can understand one comparative run without opening developer logs.

### Milestone 6 — evaluation suite

- Expand to at least 20 tasks.
- Add deterministic correctness and safety scorers.
- Run multiple trials and at least two model families if affordable.
- Analyze failure modes rather than only aggregate scores.
- Publish raw configuration and summarized results.

Exit condition: the repository contains reproducible evidence for where code mode helps and hurts.

### Milestone 7 — publication

- Complete architecture and threat-model documentation.
- Write `findings.md` with honest conclusions.
- Record a five-minute demo.
- Add a concise project landing README.
- Package reusable pieces only after the reference application proves their boundaries.

Exit condition: a new reviewer can clone, run the deterministic demo, understand the architecture, and inspect the evaluation results.

### Post-publication product validation — earned, not assumed

Only after Milestones 0–7 and the product evidence gates near the top of this
document pass, plan product phases in this order:

1. **Persistent local ledger** — SQLite, migrations, backup, restore, export,
   crash recovery, and deterministic fixture migration.
2. **Bounded source import** — CSV first, then OFX/QFX; raw evidence remains
   separate from proposals and posted facts.
3. **Provider choice** — one hosted adapter, one OpenAI-compatible adapter, and
   one local adapter behind conformance tests and explicit data-disclosure UI.
4. **Governed reconciliation** — evidence-backed matching, ambiguity review,
   exact proposals, confirmation, and an audit trail over imported records.
5. **Self-hosted distribution** — reproducible container and local install,
   documented secrets, health checks, upgrades, backup, and recovery.
6. **Optional read-only aggregation** — only after the import workflow proves
   value; connectors create source records and proposals but never move money
   or post directly.

Do not schedule mobile applications, investments, tax features, payment
initiation, broad budgeting parity, or a marketplace before this sequence
produces retention evidence. Those are separate product bets, not automatic
consequences of open sourcing the reference application.

## 18. Test plan

### Financial kernel

- Every posted event has at least two postings and balances in integer minor
  units.
- Unknown accounts, cross-ledger postings, currency mismatches, and duplicate
  idempotency keys fail atomically.
- A checking-to-cash withdrawal changes account balances but not expenses.
- A credit-card purchase increases an expense and a liability without reducing
  cash.
- Date-range reports use effective timestamps rather than stored month labels.
- Proposals and assumptions never affect balances.
- Reversal and replacement events preserve complete lineage and provenance.
- Projections can be rebuilt from the append-only event sequence.

### Registry and schemas

- Duplicate capability names fail composition.
- Unknown capability access fails closed.
- Invalid input never reaches authorization or execution.
- Invalid output never returns to generated code or the model.
- Tool and code projections expose the same eligible catalog.

### Trusted context and authorization

- Model arguments cannot override actor identity.
- Cross-ledger and inaccessible account identifiers are rejected.
- Authorization is checked on every SDK call.
- A prior authorized call does not authorize later calls.
- Changed ledger or account permissions affect subsequent calls in the same agent run.

### Code sandbox

- No filesystem, network, environment, process, import, or database access.
- Infinite loops terminate.
- Large allocations terminate.
- Excessive output is bounded.
- Capability-call and mutation budgets are enforced.
- Host objects and prototypes do not leak.
- Abort signals stop sandbox execution and pending gateway calls.

### Confirmation

- Confirmed capabilities do not execute before confirmation.
- Rejected operations produce no domain mutation.
- Confirmation displays decoded arguments.
- A confirmation cannot approve a different capability call.

### Projection equivalence

- Equivalent tool and SDK calls produce equivalent domain outcomes.
- Both modes record the same core capability trace shape.
- Presentation differences cannot change authorization or execution.

### Evaluation harness

- Fixture reset is deterministic.
- Task versions are recorded.
- Scorers detect unauthorized side effects.
- A run cannot silently omit usage or configuration metadata.

## 19. Decision gates

### Gate A — after the Pi and sandbox spike

Stop or change direction if a credible local sandbox cannot be integrated without dominating the project.

### Gate B — after five comparative tasks

Do not build a general framework if code mode merely replaces tool calls with JavaScript while producing no measurable improvement.

Continue when at least one meaningful regime emerges, such as:

- lower context usage at larger catalogs;
- fewer model turns for bulk work;
- better deterministic transformations;
- clearer application-owned authorization;
- simpler capability onboarding across both modes.

### Gate C — after 20 tasks

Choose the final open-source shape based on evidence:

- evaluation/reference project only;
- small capability projection library;
- Pi code-mode adapter;
- broader application capability framework.

The architecture must earn its generalization.

### Gate D — before a broader personal-finance product

Run the product evidence gate on the narrow import-and-reconcile workflow.
Choose one of four outcomes explicitly:

- stop at a published research/reference application;
- maintain a focused governed-ledger or MCP component;
- integrate the capability boundary with an established finance application;
- continue into the self-hosted product sequence.

Do not interpret repository attention, stars, or AI enthusiasm alone as user
retention. Continue into bank aggregation or broad consumer features only when
repeated real workflows show that governed proposals, auditability, or model
choice solve a problem users will return to.

## 20. Clean-room reference policy

Define each Bound Ledger requirement locally before consulting external implementations.
Reference material may be used to identify architectural pressures, security
risks, and failure modes. Do not copy implementation code, schemas, tests,
prompts, private naming, product abstractions, or repository-specific paths.

Record relevant public sources in ADRs. Keep private repositories, local paths,
and unrelated product details out of committed documentation.

## 21. Pi Agent Core references

- [Pi Agent Core README](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [Pi Agent Core source](https://github.com/earendil-works/pi/tree/main/packages/agent/src)
- [Pi repository](https://github.com/earendil-works/pi)
- [Pi package-scope migration](https://pi.dev/news/2026/5/7/pi-has-a-new-home)

Relevant behaviors to understand before implementation:

- `Agent` versus low-level `agentLoop`;
- `AgentTool` validation and execution;
- `beforeToolCall` and `afterToolCall` ordering;
- sequential versus parallel tool execution;
- event ordering and awaited subscribers;
- steering and follow-up queues;
- context transformation;
- cancellation and settlement;
- current session-backend interfaces.

## 22. Working method

For each subsystem:

1. State the Personal Financial Ledger requirement in Bound Ledger's own
   terminology.
2. Write the invariant and failing test.
3. Implement the smallest local design.
4. Read relevant public source material for missed failure modes.
5. Record important decisions in an ADR.
6. Avoid extraction until a second real consumer exists.

Do not treat similarity to another system as evidence that an abstraction belongs here.

## 23. Definition of done

The portfolio release is complete when:

- Personal Financial Ledger works as a coherent human application;
- tool and code modes operate the same capability registry;
- generated code cannot directly access application internals or host authority;
- deterministic authorization and sandbox tests pass without an LLM;
- at least 20 versioned tasks compare both modes;
- results include repeated trials and documented configuration;
- the inspector clearly shows proposal, computation, authorization, and effect;
- architecture and threat-model docs are complete;
- `findings.md` reports advantages, disadvantages, and failures honestly;
- the repository has no private-project dependency, branding, secrets, prompts, local paths, or copied product code;
- licensing for the new implementation is explicit.

The portfolio definition of done does not imply product readiness. A product
release additionally requires the separately planned persistence, privacy,
provider, ingestion, self-hosting, upgrade, backup/recovery, and real-user
validation gates. Until those phases exist and pass, documentation must keep
the warning against real financial data and hostile generated code.

## 24. Implementation sequence

`docs/INITIAL_PLAN.md` contains the executable contract and preserves the
historical order. Phases 1–9 completed the narrow transaction vertical slice,
capability boundary, controlled code-mode proof, and first paired evaluation.
Phases 10–14 added the general-ledger kernel, read and confirmation-bound
capabilities, Pi tool-mode baseline, and coherent human application. Phase 15
migrated discovery, the generated guest SDK, confirmation termination, and the
paired evaluation to the earned general-ledger catalog. Phase 16 is the next
planned boundary: make that deterministic evidence visually inspectable in a
read-only comparison workbench before persistence, ingestion, provider choice,
or product expansion.
