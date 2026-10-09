# Bound Ledger

Bound Ledger is being rebuilt as an open-source, local-first financial workspace
that an agent can help maintain and explain. It models what people own and owe,
what changed, what is expected, and what they intend to do.

The agent interprets input and composes financial operations. Application code
owns calculations, validation, persistence, and authority. Conversation, quick
entry, forms, pasted notes, and future integrations serve the same model; no
one input format defines the product.

## Current status: independent rewrite

The existing code is a completed, fixture-backed research prototype. It is being
replaced. R0 and a first persistent, model-free expense slice are implemented
in three independent roots; the full R0–R4 replacement gate is **not passed**.
See [the slice contract and decisions](docs/FINANCE_SLICE.md).

Build the replacement independently alongside the prototype. Once the initial
base passes the replacement gate in [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md),
remove the old implementation, its tests and fixtures, and its runtime wiring.
There is no requirement to preserve its APIs, package structure, UI, or research
benchmarks. Historical research remains in Git and [docs/archive](docs/archive).

**Start here:**

- [PLAN.md](PLAN.md): product purpose, financial concepts, agent responsibilities,
  and architectural decisions.
- [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md): active build sequence, initial-base
  acceptance criteria, and removal of the prototype.
- [CONTRIBUTING.md](CONTRIBUTING.md): contribution practices during the transition.
- [SECURITY.md](SECURITY.md): current boundaries and requirements for new work.
- [docs/REWRITE_ASSESSMENT.md](docs/REWRITE_ASSESSMENT.md): Pi integration evidence
  and the reasoning behind the reset.

## Financial foundation

| Concept | Meaning |
| --- | --- |
| Parties and ownership | Who participates and whose positions or obligations they are |
| Positions | Assets, liabilities, balances, and holdings at a point in time |
| Events and effects | Income, expenses, transfers, purchases, borrowing, repayments, and other changes |
| Claims and obligations | What is owed, under what terms, and how it is settled |
| Commitments | Expected or recurring activity, distinct from actual transactions |
| Intentions | Budgets, goals, earmarks, and plans, distinct from financial facts |
| Measurements | Amounts, currencies, units, valuations, and date precision |
| Evidence and certainty | Sources, confirmed facts, interpretations, estimates, and unknowns |

The initial base delivers a useful subset of this foundation, with room for
further concepts. Routine recording should be quick, editable, and recoverable.
The agent asks for missing information when it changes the financial meaning
and can explain the records behind an answer.

## Pi in the replacement

Use Pi's durable runtime for persisted assistant work and recovery, and its code
mode for tasks that compose multiple bounded financial operations. Ordinary tools
remain available for simple tasks. Both paths invoke the same application-owned
operations. The application needs stable request receipts and transactions;
a sandbox and task recovery do not make financial writes exactly-once.

The isolated [Pi 1.0.2 spike](experiments/pi-refresh/README.md) verifies basic
composition and one committed-phase recovery path. It is evidence, not the new
application or a production-security guarantee.

## Running the first persistent expense slice

Node 24.11.1 (also tested on 26.10.0), pnpm 11.18.0:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:finance
pnpm check:finance
pnpm --filter @bound/finance exec playwright install chromium
pnpm test:e2e:finance
pnpm dev:finance
```

Open the printed numeric loopback address. Record an expense, inspect its receipt,
reopen the app, view history/spending, Edit and Undo. An omitted account remains
unspecified; balances are unknown and currencies are never combined. Data lives
in private, Git-ignored `apps/finance/.local/ledger.sqlite`. Use synthetic data only.
No model or key is required. The agent root is a typed operation facade, **not**
a Pi/provider runtime. Income, transfers, positions, unresolved drafts,
backup/export/restore commands, Pi and broader recovery are deferred. The
[lifecycle design and security limits](docs/FINANCE_SLICE.md) are explicit.

## Running the existing prototype

These commands currently operate the **old research implementation**:

```sh
pnpm install
pnpm start
pnpm dev:personal-ledger
pnpm check
```

Requirements are Node.js 24+ and pnpm 11.18.0 or compatible. `pnpm start` runs a
deterministic tool/code comparison. The browser application uses in-memory
synthetic fixtures. Its dependencies, CI job and runtime wiring are retained;
independent finance checks are added alongside them without upgrading the old
runtime. The repository-wide check includes both old and new roots. The known
legacy code-mode memory-limit timing assertion is separate from the new gates.

See the [archived README](docs/archive/RESEARCH_README.md) for the complete
prototype command reference. Use synthetic data while the project remains
pre-alpha. The first slice has a documented local boundary, not real-data readiness
or completed Pi/isolation/backup guarantees.

## License

Apache-2.0. See [LICENSE](LICENSE).
