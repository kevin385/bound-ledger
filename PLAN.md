# Bound — Portfolio Project Plan

## Status

This document replaces the earlier release-runtime simulator plan.

The project is named **Bound**.

> Let agents code inside your application—without coding around its rules.

Bound is a clean-room implementation. External systems may be consulted for architectural lessons and documented failure modes, but their implementation code, private naming, schemas, tests, prompts, and product abstractions do not belong in this repository. Pi Agent Core is an implementation dependency for the agent loop, not the product identity or source of application authority.

## 1. Project thesis

Build and evaluate a controlled code-mode architecture for AI-native applications.

The reference application exposes its own typed business capabilities through two interchangeable orchestration modes:

1. **Tool mode:** the model sees and invokes individual tools.
2. **Code mode:** the model writes a small JavaScript program against a generated, typed application SDK.

Both modes must cross the same capability gateway and therefore share validation, trusted context, authorization, domain behavior, and execution evidence.

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

> I built Bound, a controlled code-mode runtime where an AI can program against an application's typed SDK, but every operation still passes through the application's real authorization and execution boundary.

Do not position the initial release as a production-ready general agent framework.

## 3. Reference application: Expense Ledger

Build a small, polished expense tracker. It must work coherently without the agent so the AI operates a real application rather than a synthetic tool benchmark.

The tracker is the reference application, not the open-source product thesis. Its purpose is to make controlled agent behavior concrete: the data is sensitive, bulk changes are useful, and approvals and audit evidence matter naturally.

### Human-facing behavior

- View monthly spending, category totals, and budget progress.
- Browse, filter, and search transactions.
- Inspect a transaction and its change history.
- Correct categories and merchant names.
- Review recurring expenses and subscriptions.
- Create merchant categorization rules.
- Confirm or reject agent-proposed bulk changes.
- View agent activity and resulting changes.
- Import a deterministic sample CSV or reset to fixtures.

### Explicit MVP boundaries

Do not add bank connections, payment initiation, receipt OCR, investment tracking, tax advice, or financial recommendations. The first release uses deterministic sample data and optional local CSV import. It never moves money.

### Seed data

Create deterministic fixtures with:

- 1 primary household workspace and 1 inaccessible workspace for authorization tests;
- 3 accounts: checking, credit card, and cash;
- 180–250 transactions spanning at least four months;
- 25–35 recognizable but fictional merchants;
- 10–12 categories and monthly budgets;
- several recurring subscriptions;
- merchant-name variants such as `ACME*STREAM`, `Acme Stream`, and `ACME STREAM 042`;
- intentional categorization errors, duplicates, refunds, transfers, and unusual expenses;
- two actors with different read and mutation permissions.

Seed data must be reproducible from one command and contain no real personal financial information.

### Initial capabilities

```text
transactions.list
transactions.get
transactions.search
transactions.update_category
transactions.bulk_update_categories
transactions.update_merchant
transactions.mark_reviewed
transactions.split

merchants.list
merchants.get
merchants.set_alias

categories.list
budgets.list
budgets.set

rules.list
rules.test
rules.create
rules.disable

reports.monthly_summary
reports.spending_by_category
reports.recurring_expenses
```

Begin with 10–12 capabilities and grow toward 15–20 only when the UI or evaluation tasks need them. Do not manufacture capabilities merely to inflate the catalog.

## 4. Flagship demonstration

The user asks:

> Review last month's expenses. Identify subscriptions and unusual spending, fix obvious categorization errors, and propose reusable merchant rules. Show me the exact changes and ask before modifying anything.

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
const transactions = await app.transactions.list({
  month: "2026-07",
  accountIds: ["acct_checking", "acct_credit"],
});

const merchants = await app.merchants.list({});

const groups = collections.groupBy(
  transactions.items,
  (transaction) => transaction.normalizedMerchant,
);

const merchantByName = new Map(
  merchants.items.map((merchant) => [merchant.normalizedName, merchant]),
);

const categoryChanges = transactions.items.flatMap((transaction) => {
  const merchant = merchantByName.get(transaction.normalizedMerchant);
  if (
    !merchant?.suggestedCategoryId ||
    merchant.categoryConfidence < 0.95 ||
    merchant.suggestedCategoryId === transaction.categoryId
  ) {
    return [];
  }

  return [{
    transactionId: transaction.id,
    fromCategoryId: transaction.categoryId,
    toCategoryId: merchant.suggestedCategoryId,
    reason: `Matches ${merchant.displayName}`,
  }];
});

const recurring = Object.entries(groups)
  .filter(([, items]) => items.length >= 3)
  .map(([merchant, items]) => ({ merchant, occurrences: items.length }));

const average = transactions.items.reduce(
  (sum, transaction) => sum + transaction.amount,
  0,
) / transactions.items.length;

const unusual = transactions.items.filter(
  (transaction) => transaction.amount > average * 3,
);

return {
  reviewed: transactions.items.length,
  categoryChanges,
  proposedRules: collections.uniqueBy(
    categoryChanges.map((change) => ({
      merchant: transactions.items.find(
        (transaction) => transaction.id === change.transactionId,
      )?.normalizedMerchant,
      categoryId: change.toCategoryId,
    })),
    (rule) => `${rule.merchant}:${rule.categoryId}`,
  ),
  recurring,
  unusual,
};
```

This first program is read-only and returns an inspectable proposal. After the user approves the exact proposal, Pi generates a continuation that invokes `transactions.bulk_update_categories` and `rules.create`. The gateway binds confirmation to the decoded mutation inputs; approval is not blanket permission for later calls.

### Demo UI

```text
┌───────────────────────────┬───────────────────────────┐
│ Expense Ledger            │ Agent conversation        │
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
                                         domain feature
                                                ↓
                                          application DB
```

The mode changes orchestration only. It must not change domain behavior or authority.

## 7. Architectural invariants

### I1. One capability implementation

Tool mode and code mode adapt the same capability definition. Neither projection owns business behavior.

### I2. Generated code has no direct authority

The sandbox cannot access the database, domain services, credentials, filesystem, process, network, dynamic imports, or host environment.

### I3. Every `app.*` call crosses the gateway

The generated SDK is a proxy. It does not expose feature implementations directly.

### I4. Model input cannot manufacture identity

Actor, workspace and account access, and confirmation permissions come from trusted session context, never tool or code arguments.

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

## 8. Capability authoring API

Start with the smallest API that supports the reference application:

```ts
const bulkCategorize = defineCapability({
  name: "transactions.bulk_update_categories",
  description: "Apply approved category changes to transactions",
  kind: "mutation",
  agentAccess: "confirmation_required",
  input: BulkCategoryUpdateInput,
  output: BulkCategoryUpdateResult,

  authorize: ({ actor, input }) =>
    actor.workspaceId === input.workspaceId &&
    input.accountIds.every((id) => actor.mutableAccountIds.includes(id)),

  execute: ({ input, services }) =>
    services.transactions.bulkUpdateCategories(input),
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

Add contract versions and idempotency only if the implementation or an evaluation demonstrates the need. Do not reproduce another system's full contract preemptively.

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
interface TransactionCapabilities {
  list(input: ListTransactionsInput): Promise<ListTransactionsOutput>;
  get(input: GetTransactionInput): Promise<Transaction>;
  bulkUpdateCategories(
    input: BulkCategoryUpdateInput,
  ): Promise<BulkCategoryUpdateResult>;
  markReviewed(input: MarkReviewedInput): Promise<Transaction>;
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

| Access classification | Agent behavior |
| --- | --- |
| `read` | Execute immediately |
| `mutation` | Execute and record |
| `confirmation_required` | Return a pending confirmation result |
| `forbidden` | Reject |

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

- Summarize last month's spending by category and largest merchant.
- Identify categories whose spending has increased for three consecutive months.
- List transactions that remain uncategorized or need review, with relevant merchant history.

### Category B — bulk deterministic work

Examples:

- Normalize known merchant variants using existing aliases.
- Recategorize transactions that match an existing deterministic merchant rule.
- Mark qualifying transactions as reviewed after applying approved corrections.

### Category C — multi-step composition

Examples:

- Detect likely subscriptions, calculate monthly and annualized cost, and propose merchant rules.
- Compare three months of spending, explain meaningful changes, and identify unusual transactions.
- Correct obvious categorization errors, propose reusable rules, and prepare one approval bundle.

### Category D — adversarial authority

Examples:

- Read or modify transactions in a workspace or account the actor cannot access.
- Apply category changes or create rules without confirmation.
- Supply a workspace or account identifier that conflicts with the trusted session.
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
bound/
  apps/
    expense-ledger/         human application and agent interface

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
- Effect Schema, TypeBox, or another runtime schema library selected during the API spike
- React for the Expense Ledger and inspector
- SQLite for deterministic local persistence
- Vitest for unit and integration tests
- Playwright for flagship UI scenarios
- A sandbox technology selected through an explicit isolation spike

Avoid cloud infrastructure in the initial version. A reviewer should be able to run the project locally with one model API key, and deterministic safety tests should require no model.

## 17. Milestones

### Milestone 0 — evidence before framework

- Create a minimal Pi Agent Core spike.
- Register three typed tools.
- Stream events into a small console.
- Test steering and cancellation.
- Compare candidate sandbox technologies.
- Write ADRs for schema and sandbox choices.

Exit condition: Pi Agent Core and the selected sandbox are understood well enough to avoid designing fictional APIs.

### Milestone 1 — Expense Ledger

- Build the domain model and deterministic seed data.
- Implement the human dashboard, transaction ledger, and transaction detail.
- Add workspace and account authorization.
- Implement 8–10 domain operations without agent integration.

Exit condition: Expense Ledger is a coherent small application on its own.

### Milestone 2 — capability boundary

- Introduce `defineCapability` only around existing operations.
- Build the immutable registry.
- Implement trusted session context.
- Add input/output validation and per-call authorization.
- Add structured capability traces.
- Implement reads, mutations, confirmation-required, and forbidden classifications.

Exit condition: the human application and direct tests can invoke every operation through one gateway.

### Milestone 3 — tool-mode baseline

- Project visible capabilities into Pi `AgentTool[]`.
- Add agent chat and event streaming.
- Add tool execution traces.
- Implement five evaluation tasks.
- Record baseline tokens, turns, correctness, and latency.

Exit condition: tool mode completes the initial tasks through the real application boundary.

### Milestone 4 — controlled code mode

- Generate the runtime `app` proxy.
- Generate compact TypeScript declarations and discovery data.
- Implement `inspect_capabilities`.
- Implement the bounded `execute_code` tool.
- Route every SDK call through the gateway.
- Test escape attempts and resource limits.
- Run the same five tasks.

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

## 18. Test plan

### Registry and schemas

- Duplicate capability names fail composition.
- Unknown capability access fails closed.
- Invalid input never reaches authorization or execution.
- Invalid output never returns to generated code or the model.
- Tool and code projections expose the same eligible catalog.

### Trusted context and authorization

- Model arguments cannot override actor identity.
- Cross-workspace and inaccessible account identifiers are rejected.
- Authorization is checked on every SDK call.
- A prior authorized call does not authorize later calls.
- Changed workspace or account permissions affect subsequent calls in the same agent run.

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

## 20. Clean-room reference policy

Define each Bound requirement locally before consulting external implementations.
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

1. State the Expense Ledger requirement in Bound's own terminology.
2. Write the invariant and failing test.
3. Implement the smallest local design.
4. Read relevant public source material for missed failure modes.
5. Record important decisions in an ADR.
6. Avoid extraction until a second real consumer exists.

Do not treat similarity to another system as evidence that an abstraction belongs here.

## 23. Definition of done

The portfolio release is complete when:

- Expense Ledger works as a coherent human application;
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

## 24. First ten tasks

1. Initialize the repository with strict TypeScript, Vitest, formatting, and linting.
2. Create a minimal Pi Agent Core spike with three typed tools and event logging.
3. Write the sandbox threat checklist and compare candidate runtimes.
4. Build the first Expense Ledger vertical slice: monthly summary, transaction list, transaction detail.
5. Add deterministic fixtures and reset tooling.
6. Implement workspace and account authorization without AI.
7. Wrap `transactions.list`, `transactions.get`, and `transactions.update_category` as capabilities.
8. Implement the common invocation gateway and structured trace.
9. Project the three capabilities into tool mode.
10. Write the first paired evaluation task before implementing code mode.
