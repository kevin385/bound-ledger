# Bound Ledger — Product and Architecture Plan

## Decision and document authority

As of 5 October 2026, the active direction is an independent replacement of the
existing research implementation. Build a useful financial workspace from
financial concepts, with an agent operating the same domain behavior as the
human interface. The old tool/code comparison is no longer the product goal.

This document defines what to build and why. [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md)
defines the active sequence and initial-base replacement gate.
[CONTRIBUTING.md](CONTRIBUTING.md) defines contribution practices. Update these
documents together when direction changes. Archived research plans do not
authorize or block replacement work.

R0 and the first persistent manual expense slice are implemented; see
[docs/FINANCE_SLICE.md](docs/FINANCE_SLICE.md). The full initial base is not complete.
Existing source stays runnable until the replacement gate passes. This is a clean
implementation with no compatibility obligation to the prototype's APIs,
schemas, catalogs, framework abstractions, or evaluations.

## Product purpose

A financial system represents economic reality over time: what someone owns,
what they owe, what happened, what is expected, and what they intend to do.
Bound Ledger makes that reality easy to record, inspect, correct, and explain.
An agent helps maintain the representation and answer questions from it.

Conversation, quick entry, forms, files, and connected data are input channels.
The model must not be shaped around a particular note layout, an import format,
a statement-reconciliation workflow, or a showcase benchmark.

The product is open-source, local-first, and usable without an agent. Financial
records remain accessible if a model is unavailable or a conversation is reset.
Support chosen providers through a small adapter; do not build a provider
platform. A hosted service is not required for basic use.

## Financial concepts

### Parties and ownership

People, households, businesses, and institutions participate in events.
Ownership establishes whose asset or obligation a position is and whether it is
individual, shared, or held for another party. An account locates positions;
it does not define their owner by itself. Shared use and shared ownership differ.

### Positions

Assets include cash, deposits, holdings, property, and receivables. Liabilities
include loans, credit balances, and payables. Net worth requires a consistent
valuation date and currency basis and sufficient coverage of both.

Some positions have quantities: shares, weight, or ownership fractions. Cost,
quantity, and current value are distinct. A recorded balance snapshot is not an
event history. Deriving a complete balance needs an opening position and complete
changes or another reliable snapshot. Unknown is not zero.

### Events and effects

An event describes a change, with identity, participants, effective date or
period, evidence, and connected effects. It can affect several positions at once.

| Event | Meaning to preserve |
| --- | --- |
| Income or expense | An economic gain or cost, possibly received or paid later |
| Transfer | A change of location under the same ownership |
| Asset purchase or sale | An exchange involving a position; proceeds differ from gain |
| Borrowing or lending | A liability or receivable plus corresponding funding |
| Repayment or collection | Reduction of an existing obligation or claim |
| Refund or reimbursement | A change linked to an earlier event |
| Gift or contribution | Ownership and purpose determine its treatment |
| Revaluation | A value change without cash movement |
| Correction | A repair linked to the original record |

A payment is not enough to infer its economic meaning. A loan payment can contain
principal, interest, and fees. An investment purchase exchanges assets. Preserve
these effects; categories and tags support views rather than replacing them.
Accounting entries may enforce consistency internally without making accounting
terminology mandatory in ordinary entry.

### Claims and obligations

Claims and obligations connect parties, an amount or rule, terms, and settlements.
Partial settlement leaves a remainder. Due dates, interest, and installments are
meaningful details when supplied. Distinguish agreed debts from informal
expectations and contingent amounts. Paying toward a shared purchase does not
itself establish a debt between contributors.

### Commitments

Bills, subscriptions, installments, contributions, and expected income describe
future or recurring activity. An expected event is not an actual transaction.
Schedules can generate expectations and link to actual fulfilment. A date passing
cannot prove payment or receipt.

### Intentions

Budgets, savings goals, target allocations, earmarks, and replenishment plans
express intent. They do not create assets, third-party debts, or cash movements.
Progress can reference actual positions and events. Forecasts preserve their
assumptions and remain separate from observed facts.

### Measurement and evidence

Amounts have currencies; quantities have units; valuations have dates and sources.
Different currencies require explicit conversion rates before aggregation.
Money uses checked integer minor units; quantities need an explicit precision
model. Reject overflow and unsupported precision.

Effective dates, recording times, and due dates have different meanings. Preserve
date precision and period labels rather than inventing dates. Keep source,
author, interpretation, assumptions, and links. Confirmed facts, interpretations,
estimates, plans, and unknowns remain distinguishable.

Unresolved notes can be stored without inventing financial effects. Repeated
descriptions or amounts are not proof of duplication. Subtotals and components
must not both be treated as independent financial activity.

## Agent responsibilities

| Responsibility | Agent behavior | Domain authority |
| --- | --- | --- |
| Capture | Interpret ordinary language and evidence | Validate and persist supported facts |
| Clarify | Ask for facts that change meaning | Preserve uncertainty without fabricated effects |
| Connect | Suggest settlement, refund, and ownership links | Check identities and prevent duplicate effects |
| Explain | Answer with records and assumptions | Calculate balances and outstanding amounts |
| Plan | Explore explicit scenarios and tradeoffs | Compute declared inputs; separate plans from facts |
| Maintain | Prepare corrections, splits, and rules | Apply exact operations with revision history |
| Monitor | Find changes or deadlines when enabled | Own schedules and notification preferences |
| Execute | Prepare authorized external actions | Enforce action-specific authority and verify completion |

Capture, clarification, explanation, and correction belong to the initial base.
Other roles are conceptual extensions, not instructions to implement a complete
financial suite immediately. External money movement is outside the initial scope.

Recording a clearly requested ordinary event should return a compact receipt
with Edit and Undo. It does not require a separate proposal-review ceremony.
Ambiguous input can stay unresolved. Bulk changes and destructive operations
need an exact preview proportional to their impact. Executing a payment or trade
is a different capability from recording that it happened.

The application computes financial truth. The agent composes operations and
explains results; generated text does not establish a balance, agreement,
completed action, or valuation by assertion.

## Independent architecture

Start with one application, one financial-core package, and one thin agent
adapter. [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md) specifies the new roots.
They must not import old application or package code. External dependencies and
shared repository tooling may be used; legacy behavior can inform independently
written invariants.

The financial core owns records, rules, validation, revisions, and transactional
request receipts. SQLite persists domain data locally. Domain operations serve
human forms and model tools without competing rules. Persistence adapters live
with their behavior; do not add generic database, policy, harness, or capability
frameworks.

The application owns owner/workspace context, UI, local server lifecycle,
configuration, backups, and model-data disclosure. Initially support one local
owner through loopback access. Remote or multi-user access requires a separate
design. Record exact UI and runtime choices during bootstrap; neither retaining
nor removing Effect or Astryx is a product goal.

### Pi durable and code modes

Use pi-durable for assistant conversations and checkpointed work. Use pi-codemode
to compose bounded operations when a task benefits from it. Ordinary tools remain
available. Both paths call the same validated financial operations. Do not build
another harness, interpreter, or generated guest SDK.

Financial storage is independent of assistant storage. Pi documents hold run
references and progress; domain records remain authoritative. Reset, compaction,
fork, and model replacement must not change financial facts. One long-lived
local process owns the harness; opening one per request is invalid.

Every nested call needs validation, host-derived authority, bounded inputs and
outputs, traceability, and cancellation. A direct sandbox callback does not
acquire outer-tool hooks or individual durable tasks automatically. Do not expose
raw SQL, database handles, ambient filesystem/network access, or credentials.
Set explicit time, memory, program, call, and result limits; evaluate upstream
isolation rather than inheriting the old subprocess's security claims.

Domain writes commit effects, revisions, and stable receipts in one transaction.
Retrying the same key and canonical payload returns its receipt; changed payload
reuse fails. Domain and Pi result commits are separate: recovery reacquires the
domain receipt in that gap. Cancellation cannot undo completed effects, and
script failure does not roll them back.

Code execution starts unsafe to replay. Enable safe replay only when repeated
effects of the complete script are demonstrated safe. Durable work resumes at
checkpoints, not arbitrary JavaScript instructions. Pin tested Pi versions;
the durable API is experimental. See [docs/REWRITE_ASSESSMENT.md](docs/REWRITE_ASSESSMENT.md)
for the tested release and the isolated spike's limitations.

## Scope and success

The initial base covers persistent manual capture and correction, common money
positions, uncertainty, deterministic questions, and a thin tool/code agent
integration with recovery. Native currencies are retained; conversion, market
feeds, tax rules, securities lots, complex credit terms, bank connections, and
payment/trading execution are later work. The conceptual model includes their
place without authorizing them now.

Do not require CSV import, statement reconciliation, chart-of-accounts setup,
or the user's notes as the initial interaction. Optional accounts and unknown
positions must be represented honestly. Unsupported events remain notes or
drafts rather than fabricated facts.

Judge progress by capture effort, correct treatment, useful answers, minimal
unnecessary questions, traceability, correction/recovery, and repeated use.
Every slice should let a person save a financial fact and understand its effects.
Model and sandbox benchmarks are diagnostics, not the product completion metric.

Remove the old implementation after the initial-base gate passes. Historical
research in [docs/archive](docs/archive) imposes no compatibility obligation.
