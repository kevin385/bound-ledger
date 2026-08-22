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
- deterministic general-ledger Pi tool and code-mode reconciliation paths;
- one immutable eight-operation manifest that drives code-mode discovery and
  the generated QuickJS guest SDK;
- explicit parent-boundary termination for confirmation-required generated
  mutations, with trusted approval and rejection kept outside the model;
- sandbox threat probes, a canonical paired general-ledger evaluation, and its
  superseded historical predecessor.

Phase 15 completed the shared general-ledger comparison boundary. Phase 16 is
planned as a read-only visual comparison workbench over this existing evidence;
see [`docs/INITIAL_PLAN.md`](docs/INITIAL_PLAN.md) for its scope and gates.

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
pnpm eval:general-ledger
pnpm dev:personal-ledger
pnpm check
```

`pnpm start` runs the canonical paired deterministic reconciliation. Tool mode
uses three general-ledger tools; code mode uses one `execute_code` outer call
whose generated program makes the same three gateway calls. The CLI prints the
facts, agent and capability evidence, metrics, and comparison. Pi uses its
in-memory faux provider; neither path requires an API key.
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
`pnpm eval:general-ledger` runs the versioned July reconciliation once per mode
from fresh fixture state, applies deterministic correctness and safety checks,
and prints the paired metrics and comparison. The checked-in result is in
[`evals/results/general-ledger-reconciliation-v1.md`](evals/results/general-ledger-reconciliation-v1.md).
The retired July-list result remains in `evals/results` and is clearly marked
as superseded; its command and runner are gone.
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

Phase 15 is complete. It migrated the validated general-ledger catalog into
code mode, added progressive discovery from one manifest, made pending
confirmation termination explicit, and replaced the canonical legacy
July-list comparison with a general-ledger reconciliation evaluation.

Phase 16 is planned and is the only authorized next implementation phase. It
adds a read-only visual comparison workbench for the deterministic tool/code
evidence already present; it does not add live models, provider selection,
persistence, ingestion, bank connectivity, or autonomous finance behavior.

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
