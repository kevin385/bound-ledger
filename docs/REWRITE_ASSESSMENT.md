# Rewrite rationale and Pi integration evidence

Assessed 5 October 2026. This is background evidence for the active
[product plan](../PLAN.md) and [implementation plan](INITIAL_PLAN.md), not a
competing implementation sequence.

## Why reset the project

The research prototype proved useful technical boundaries: application-owned
operations, controlled generated code, ledger invariants, confirmation, and
paired deterministic evaluations. It remains in-memory and fixture-backed and
does not provide a persistent everyday financial workspace.

The user selected an independent implementation around financial concepts:
positions, events and effects, ownership, claims, commitments, intentions,
measurement, and evidence. Their existing notes illustrate possible input;
they are not the product schema. CSV import, statement reconciliation, and
a specific tracker layout are not prerequisites.

Build the new base alongside old source with no imports or compatibility bridge,
then remove the prototype once the initial-base gate passes. The old plan's
Phase 20 restrictions no longer apply. Preserve historical evidence in the
[archive](archive/README.md) or Git rather than operational legacy packages.

## Upstream packages checked

The npm registry reported `1.0.2` for both pi-codemode and pi-durable.
Tag `v1.0.2` resolves to `cd32f7725fdbddbaecdff5b1e68491563394e0ca`, released
4 October 2026. The current research workspace still pins pi-agent-core and
pi-ai to `0.84.1`; it was not upgraded by this assessment.
Sources: [codemode changelog](https://github.com/earendil-works/pi/blob/v1.0.2/packages/codemode/CHANGELOG.md),
[durable changelog](https://github.com/earendil-works/pi/blob/v1.0.2/packages/durable/CHANGELOG.md).

`pi-codemode` supplies async JavaScript execution over injected tools and can
replace custom interpreter/SDK plumbing. Its schemas describe arguments without
validating them; script store persistence belongs to the host. The worker boundary
must be evaluated independently of the old subprocess proof.
Source: [codemode README](https://github.com/earendil-works/pi/blob/v1.0.2/packages/codemode/README.md).

`pi-durable` supplies stored conversations, documents, task checkpoints, and
SQLite/JSONL recovery. Its API is experimental and storage assumes one owning
process. It is useful for assistant work, not the authority for financial facts.
Source: [durable README](https://github.com/earendil-works/pi/blob/v1.0.2/packages/durable/README.md).

An interrupted tool is rerun only when both stored and current replay policies
say safe; other interruptions become error results. The application must make
operations repeatable using stable request receipts and must justify whole-script
replay. A task restart does not resume arbitrary JavaScript at its interrupted
instruction.
Source: [tool task implementation](https://github.com/earendil-works/pi/blob/v1.0.2/packages/durable/src/harness/tool.ts).

Use a thin adapter between these packages and validated financial operations.
Every nested invocation needs host policy and traceability; a direct callback
does not automatically become an individual durable tool task.

## Isolated evidence

The [reproducible spike](../experiments/pi-refresh/README.md) ran on Node 24.20.0
with direct pi-codemode, pi-durable, pi-ai, and Chord dependencies pinned to
`1.0.2`. It uses synthetic rows, no provider calls, and no credentials. Six checks
passed:

1. Guest scope lacks `fetch`, `process`, `require`, and an uninstalled posting tool.
2. The host rejects invalid arguments despite a declared schema.
3. A host draft survives a later script failure.
4. A failed script returns no store writes to persist.
5. An infinite loop reaches the explicit deadline.
6. A child commits a proposal and next-phase checkpoint to SQLite, is killed with
   SIGKILL without closing the harness, and another process finishes with exactly
   one pending proposal.

The synthetic proposal is a recovery probe, not a mandatory product review queue.
The last check covers interruption after a committed phase, not an interrupted
nested tool, generation, human approval, or external database write. None of
these checks proves production isolation, model quality, general exactly-once
effects, or useful financial behavior. R3/R4 in the active implementation plan
address the missing domain integration and recovery coverage.

The spike remains an isolated experiment installed into a temporary directory.
It does not add a new workspace or modify the project's dependency catalog.
Transitive dependencies are not locked by the experiment.
