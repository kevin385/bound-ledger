# Bound Ledger

Bound Ledger explores a simple idea: application-owned operations should
remain the authority whether an AI invokes them as tools or through generated
code.

The repository is deliberately a small Effect v4 monorepo with a TanStack Start
personal-ledger application, deterministic Pi Agent Core, and controlled
code-mode paths. Generated code runs in a fresh
QuickJS-WASM runtime inside a disposable subprocess and can reach ledger
behavior only through the same capability gateway as tool mode. This remains a
local research proof, not a production sandbox or framework.

The possible long-term direction is an open-source, self-hostable,
model-agnostic personal-finance workspace: people may use a local or hosted
model to analyze evidence and propose exact operations, while deterministic
ledger code and explicit confirmation remain authoritative. That product does
not exist in this repository today. Persistence, real-data import, provider
selection, bank connectivity, authentication, and production isolation are
future evidence-gated work.

## What exists today

- an in-memory, single-currency, append-only double-entry ledger with
  deterministic fixtures;
- accounts, posted events, unposted proposals, balances, activity, expenses,
  trial balance, reversal, replacement, provenance, and idempotency behavior;
- one capability gateway for input/output decoding, trusted-session
  authorization, confirmation-bound mutations, and structured attempts;
- a governed human application with dashboard, journal, event detail, proposal
  review, expense/reversal requests, exact confirm/reject controls, and reset;
- a deterministic general-ledger Pi tool-mode reconciliation;
- a controlled QuickJS-WASM code-mode proof still using the legacy
  `transactions.*` catalog;
- sandbox threat probes and one historical paired tool/code evaluation.

The next phase migrates code mode and the paired evaluation to the same
general-ledger catalog already used by tool mode. See
[`docs/INITIAL_PLAN.md`](docs/INITIAL_PLAN.md) for the executable Phase 15
contract.

```text
apps/cli                runnable demos, agents, and evaluations
apps/personal-ledger    Astryx browser application and trusted server functions
packages/capability     validated and authorized invocation boundary
packages/code-mode      bounded guest SDK and subprocess execution bridge
packages/ledger         ledger domain and legacy transaction proof
packages/pi-adapter     Pi tool projection and event translation
experiments/sandbox     executable runtime comparison and threat probes
evals/results           checked-in paired evaluation evidence
```

## Requirements

- Node.js 24 or newer
- pnpm 11.18.0 or compatible

## Run it

```sh
pnpm install
pnpm start
pnpm demo:ledger-read
pnpm demo:ledger-confirmation
pnpm demo:ledger-agent
pnpm eval:july-list
pnpm dev:personal-ledger
pnpm check
```

`pnpm start` runs paired deterministic Pi conversations: tool mode selects the
list tool, while code mode selects `execute_code` with a generated program.
Both list July 2026 transactions through the same gateway. The CLI prints both
agent event streams, the code-mode result, call counts, and structured
capability attempts. Pi uses its in-memory faux provider; neither path requires
an API key.
`pnpm demo:ledger-read` runs the first read-only general-ledger catalog directly
through the shared capability gateway. It prints readable accounts, July posted
activity and expenses, balances, trial balance, and structured attempts without
using an agent projection.
`pnpm demo:ledger-confirmation` demonstrates the trusted mutation boundary. It
rejects one pending post, then approves an exact post, reversal, and balanced
replacement while printing their settled structured attempts. Confirmation is
owned by the gateway runtime and is not exposed as an agent tool.
`pnpm demo:ledger-agent` runs the deterministic general-ledger Pi tool-mode
baseline. Three sequential tools reconcile July activity and the August-opening
trial balance through the real gateway, then print the assistant answer beside
ordered agent events and structured capability attempts. The faux provider
requires no API key.
`pnpm eval:july-list` runs the versioned July listing task once per mode from
fresh fixture state, applies deterministic correctness and safety checks, and
prints the paired metrics and comparison. The checked-in sample result is in
[`evals/results/july-list-v1.md`](evals/results/july-list-v1.md).
`pnpm dev:personal-ledger` starts the local TanStack Start application. Its
dashboard, event journal/detail, immutable proposal review, expense/reversal
confirmation controls, and deterministic reset all use the same
application-owned capability gateway. The responsive interface uses Astryx's
neutral theme; TanStack Router, Query, and Form own navigation, server state,
and human mutation forms. Use only the checked-in fixture data; this remains a
local research application. Open <http://127.0.0.1:4173> after the development
server starts.
`pnpm check` typechecks and tests every workspace.
`pnpm test:sandbox` runs the pinned QuickJS-WASM and `isolated-vm` escape and
resource-limit comparison in disposable child processes.

## Project status

Bound Ledger is pre-alpha research software. It is not a production security
boundary and should not process real financial data or untrusted generated
code.

Phase 14 is complete. Phase 15 is planned and is the only authorized next
implementation phase. It migrates the validated general-ledger catalog into
code mode, adds progressive discovery from one manifest, makes pending
confirmation explicit, and replaces the canonical legacy July-list comparison
with a general-ledger reconciliation evaluation. It does not add live models,
provider selection, persistence, ingestion, or the agent UI.

Please report security issues through GitHub's private vulnerability reporting
flow described in [SECURITY.md](SECURITY.md).

## Plan map

- [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md) is the authoritative build order.
  It names the current phase, its expected files, tests, exit condition, and
  the point at which each new package may be introduced.
- [PLAN.md](PLAN.md) is the research thesis and target architecture. It does
  not override the current implementation phase.

The current task is identified at the top of the implementation plan. Do not
begin work from a later phase before its documented gates.

The repository is named `bound-ledger`; workspace packages retain the
`@bound/*` namespace.

## License

Apache-2.0. See [LICENSE](LICENSE).
