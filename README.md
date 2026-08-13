# Bound Ledger

Bound Ledger explores a simple idea: application-owned operations should
remain the authority whether an AI invokes them as tools or through generated
code.

The repository is deliberately a small Effect v4 monorepo with a deterministic
Pi Agent Core path. A Phase 6 experiment selected a subprocess-isolated
QuickJS-WASM boundary for the next local proof; it is not a production sandbox
or framework and the repository does not contain database or UI code.

```text
apps/cli          runnable composition root
packages/capability validated and authorized invocation boundary
packages/ledger   expense-ledger behavior and tests
packages/pi-adapter Pi tool projection and event translation
experiments/sandbox executable runtime comparison and threat probes
```

## Requirements

- Node.js 24 or newer
- pnpm 11.18.0 or compatible

## Run it

```sh
pnpm install
pnpm start
pnpm check
```

`pnpm start` runs a deterministic two-turn Pi conversation that lists July 2026
transactions and prints its agent events and structured capability attempt. It
uses Pi's in-memory faux provider and requires no API key.
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
