# Bound Ledger

Bound Ledger explores a simple idea: application-owned operations should
remain the authority whether an AI invokes them as tools or through generated
code.

The repository is deliberately a small Effect v4 monorepo with deterministic
Pi Agent Core and controlled code-mode paths. Generated code runs in a fresh
QuickJS-WASM runtime inside a disposable subprocess and can reach ledger
behavior only through the same capability gateway as tool mode. This remains a
local research proof, not a production sandbox or framework.

```text
apps/cli          runnable composition root
packages/capability validated and authorized invocation boundary
packages/code-mode bounded guest SDK and subprocess execution bridge
packages/ledger   ledger domain and legacy transaction proof
packages/pi-adapter Pi tool projection and event translation
experiments/sandbox executable runtime comparison and threat probes
evals/results      checked-in paired evaluation summary
```

## Requirements

- Node.js 24 or newer
- pnpm 11.18.0 or compatible

## Run it

```sh
pnpm install
pnpm start
pnpm eval:july-list
pnpm check
```

`pnpm start` runs paired deterministic Pi conversations: tool mode selects the
list tool, while code mode selects `execute_code` with a generated program.
Both list July 2026 transactions through the same gateway. The CLI prints both
agent event streams, the code-mode result, call counts, and structured
capability attempts. Pi uses its in-memory faux provider; neither path requires
an API key.
`pnpm eval:july-list` runs the versioned July listing task once per mode from
fresh fixture state, applies deterministic correctness and safety checks, and
prints the paired metrics and comparison. The checked-in sample result is in
[`evals/results/july-list-v1.md`](evals/results/july-list-v1.md).
`pnpm check` typechecks and tests every workspace.
`pnpm test:sandbox` runs the pinned QuickJS-WASM and `isolated-vm` escape and
resource-limit comparison in disposable child processes.

## Project status

Bound Ledger is pre-alpha research software. It is not a production security
boundary and should not process real financial data or untrusted generated
code.

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
