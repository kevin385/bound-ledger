# Bound Ledger — Replacement Implementation Plan

## Active direction

**Current step: R0 bootstrapped; first persistent expense slice through R1/R2.**
Status: the three independent roots build/check, and manual expense capture,
persisted receipts/history/spending, correction and undo work without a model.
See [FINANCE_SLICE.md](FINANCE_SLICE.md) for contracts, runtime decisions, runnable
commands, security boundaries and the deferred lifecycle design. Broader R1/R2,
backup/export/restore, Pi/provider integration and R3/R4 remain unimplemented.
The initial-base replacement gate is not passed; no legacy source is removed.

This is the authoritative implementation sequence for the new direction in
[PLAN.md](../PLAN.md). It supersedes the old nineteen-phase research sequence.
Persistence, a useful human interface, and Pi integration are part of the new
base; running the old live-model pilot is not a prerequisite.

Build independently alongside existing code, then remove the existing
implementation entirely when the initial-base gate below passes. Do not port the
old abstractions, maintain API compatibility, or import its runtime packages.
No old source is removed by this documentation change.

## Replacement source ownership

The following paths are implemented bootstrap workspaces:

```text
apps/finance                  local application and composition root
packages/finance-core         financial operations, records, SQLite persistence
packages/finance-agent        thin Pi durable/tool/code adapter
```

Proposed package names are `@bound/finance`, `@bound/finance-core`, and
`@bound/finance-agent`. Use these independent names until the prototype is removed;
renaming them later is not required.

Dependency direction:

```text
apps/finance -> packages/finance-agent -> packages/finance-core
apps/finance -------------------------> packages/finance-core
```

The core must not depend on Pi or the UI. The adapter uses the core's public
operations. The app supplies trusted local-owner/workspace context and composes
resources. Do not create generic capability, database, provider, trace, testing,
workflow, or policy packages. Keep related modules in these roots until a real
second consumer justifies extraction.

The seven existing application/package workspaces are the temporary research
implementation. Shared build configuration, the dependency catalog, and the
lockfile can serve both implementations while their source remains independent.
Declare new dependencies explicitly; do not upgrade the old runtime as a side
effect of bootstrapping the replacement.

## R0 — Bootstrap and make decisions concrete

Deliver:

- New roots, strict TypeScript configuration, and declared package exports with
  no imports from old source or internal package paths.
- A short decision record for the exact Node/SQLite adapter, Pi release, model
  adapter, and UI dependencies. Node 24 and SQLite are the initial local baseline;
  verify APIs and pin compatible releases at implementation time. Pi 1.0.2 was
  tested in the assessment; it is not a claim about all future releases.
- A domain contract covering amount/currency precision, identity, ownership,
  effective dates and date precision, evidence, revisions, optional accounts,
  incomplete records, and request-key/payload receipt behavior.
- A schema/migration and local-data lifecycle design: paths, backups, restore,
  export, and compatibility failure behavior. Keep runtime data ignored by Git.
- Explicit opt-in model configuration, secret handling, and data-scope disclosure.
  Domain and ordinary tests do not need a provider or API key.
- New development and check commands plus CI coverage that coexist with old
  checks. Proposed names are `dev:finance`, `build:finance`, and `check:finance`;
  document them as runnable only after they are added.

Exit: the new workspaces build independently, dependencies and decisions are
recorded, and contributors can run their checks without invoking the old
financial runtime. Do not scaffold every conceptual feature as empty packages.

## R1 — Persistent financial core

Implement the smallest useful money-event subset of the broader financial model:

- Local owner/workspace, parties, optional money accounts/positions, and known
  opening values or balance observations.
- Financial events with connected effects, evidence, explicit or uncertain
  interpretation, effective time/period precision, and revision history.
- Record/query/correct/undo operations for income, expenses, and same-owner
  transfers; preserve links and distinguish recording from actual execution.
- Cash-position projections when inputs are complete, and spending/income
  projections from known event facts. An account can be unspecified: a known
  expense may count in spending without asserting which account funded it.
- Private unresolved notes/drafts for incomplete or unsupported effects; no
  invented balances, dates, debts, currency conversions, or ownership.
- SQLite transactions, schema migrations, and stable request receipts. Same key
  plus same canonical payload returns the prior receipt; mismatched reuse fails.
  Receipt identity is bound to workspace and operation, not just model output.
- Correct fixed-precision arithmetic and revision-aware projections. If balanced
  postings are used internally, enforce their invariants for fully specified
  effects; do not force missing evidence into fabricated accounting entries.

Use fresh synthetic fixtures. Independently written tests cover ordinary capture,
transfer exclusion from spending, incomplete coverage/unknown balances, correction,
undo, date precision, amount overflow, restart persistence, and competing/repeated
requests. Include a concrete fault boundary around the domain commit/receipt.

Exit: a caller can record, inspect, and correct financial facts through the core
without an agent; restart does not lose data, and retries cannot duplicate effects.

## R2 — Useful human application

Build an accessible local interface around the same core operations:

- Quick entry/form with description, amount, meaning, and optional date, account,
  category, or relationship. Use configured owner timezone for date defaults;
  preserve supplied period precision when exact dates are unknown.
- Running history, record detail, compact save receipts, Edit, and Undo.
- Summary views that distinguish spending, income, transfers, and known position
  values, with currency and coverage limitations visible where they affect answers.
- Saving unresolved information and later completing it without losing context.
- Backup/export/restore and a documented local-owner data lifecycle. A restorable
  backup includes authoritative domain state; assistant history is identified
  separately. Reject unsupported schema versions rather than silently resetting.

No model is required. A chart-of-accounts wizard, import pipeline, comparison
screen, and mandatory approval queue are not part of this slice. Do not reproduce
the supplied personal note layout as the product template.

Exit: a person can add, find, edit, undo, and understand records, close/reopen the
application, and restore a synthetic backup through the manual path.

## R3 — Thin agent integration

Implement ordinary tools and bounded code mode over the same public operations:

- Natural-language entry and clarification; source-linked explanations from
  deterministic query results. Do not infer facts simply to satisfy a schema.
- A clear distinction between an explicit recording request, an exploratory
  question, a proposed change, and an external action. Questions must not save
  events. Routine requested recording returns an editable receipt.
- The application's validation and authority on every nested invocation, plus
  bounded arguments/results, operation counts, execution deadlines, and traces.
- Pi durable conversations/tasks and Pi codemode execution. Keep their storage
  separate from domain truth. Do not rebuild Pi's harness or a custom interpreter.
- Host-owned durable request identities and receipt recovery. Prevent retries
  of a single intended operation from duplicating entries; identical separate
  user requests may describe genuine repeated transactions.
- Manual/provider-unavailable fallback, cancellation, and explicit configuration
  of what data a chosen provider receives. Ordinary CI stays network-free.

Use a deterministic fake provider through the actual integration. Cover both
ordinary tools and code mode on recording, a multi-operation read, uncertainty,
and correction; assert final domain state and answer evidence. This is behavior
coverage, not a new matrix of competing orchestration frameworks.

Exit: a supported request reaches the same domain behavior through the human,
tool, and code paths; a question leaves domain facts unchanged; a failed model
cannot invent a successful save. No live-model call is needed to run these checks.

## R4 — Recovery and initial-base verification

Test process interruption and reopening at specific boundaries:

- Before and after domain commit, including the gap before Pi records the result.
- During a nested read and a receipt-protected write.
- During generation and after committed progress; reattach the UI from persisted
  state instead of relying on an old event stream.
- During correction/undo and competing retries.

Keep unsafe-to-replay code unsafe until whole-script behavior is justified.
A task checkpoint is not a suspended JavaScript instruction. Cancellation leaves
already committed facts intact and identifies their receipts. A model restart,
conversation reset/compaction/fork, or provider failure cannot reset financial data.

Check sandbox host-access and resource limits on the replacement runtime; the old
QuickJS subprocess ADR is not an approval of Pi's worker boundary. Record residual
risks and packaging/WASM requirements in a new decision/threat-model document.

## Initial-base replacement gate

R0–R4 constitute the initial base. It is ready when all of the following are
implemented and demonstrated with synthetic data:

1. The replacement builds and runs independently, with no old-source imports.
2. Manual record/query/correct/undo works without a model; optional-account and
   incomplete records are represented honestly.
3. Deterministic amounts, event effects, projections, revisions, and request
   receipts pass the core invariants and restart/concurrency checks.
4. The local UI supports the ordinary workflow and backup/restore. User-visible
   totals identify currency and incomplete position coverage where needed.
5. Tool and code paths use the same validated operations; fake-provider coverage
   proves capture, explanation, uncertainty, and correction behavior.
6. Durable interruption/recovery passes at the domain-commit/Pi-result gap and
   cannot duplicate effects or lose committed corrections.
7. New build, typecheck, tests, and browser checks pass in CI; active docs and
   security records describe the implemented base and its remaining limitations.

Passing this gate authorizes the already-agreed prototype removal step. It is
not a production-release or real-data security certification. A live provider
smoke test is optional and does not substitute for the deterministic gate.
The full concepts in PLAN.md remain direction, not a requirement to implement
complex investments, debt terms, commitments, goals, or integrations before cutover.

## R5 — Remove the research implementation

Once the initial-base gate passes, remove the old implementation in a dedicated,
reviewable change. Verify the replacement before deletion; retain history in Git.

Remove:

- `apps/cli` and `apps/personal-ledger`;
- `packages/ledger`, `packages/capability`, `packages/code-mode`,
  `packages/pi-adapter`, and `packages/evaluation`;
- old fixtures, sandbox experiment source, evaluation runners/configs, generated
  route artifacts, and tests that only serve those workspaces;
- old root commands, unused dependencies/catalog entries, exports, CI jobs,
  configuration, and scoped agent guidance;
- superseded experimental source after its meaningful checks are independently
  covered by the new integration.

Historical evidence may remain under the documentation archive, or only in Git.
It must not remain as an operational dependency, compatibility test, or active
implementation plan. Fix links and labels when removing source they reference.
No private/local `.pi` state or user data belongs in the deletion or commit.

Point the default development/start/check/build commands and CI at the replacement.
Search for remaining imports and runtime references, install from the resulting
lockfile, run all replacement checks, and verify a fresh launch plus backup
restore. Update README, CONTRIBUTING, SECURITY, and the current-step marker to
reflect the actual cutover.

Exit: only the new implementation is maintained and executed. There is no
parallel legacy mode or adapter keeping old application logic alive.

## Work after the base

Choose complete slices through the financial concepts when they become useful:
claims and settlements, commitments and fulfilment, intentions and progress,
quantity holdings and valuations, or another demonstrated need. Each slice adds
records, operations, calculations, human use, agent use, and recovery together.
Do not make CSV import, bank sync, or monthly reconciliation a prerequisite for
ordinary recording. New external actions require their own authority and risk
contract and remain outside this initial plan.

## Immediate next task

Independently verify/review the first expense slice, then finish broader R1/R2
including the designed backup/export/restore lifecycle before claiming those
steps complete. Pi/provider integration and R3/R4 recovery/isolation remain
separate work. Do not remove the prototype or continue its old Phase 19 pilot
as a substitute for the initial-base replacement gate.
