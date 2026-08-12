# Bound Ledger

Bound Ledger explores a simple idea: application-owned operations should
remain the authority whether an AI invokes them as tools or through generated
code.

The repository is deliberately starting as a small Effect v4 monorepo. It is
not a framework and does not yet contain agent, sandbox, database, or UI code.

```text
apps/cli          runnable composition root
packages/capability validated and authorized invocation boundary
packages/ledger   expense-ledger behavior and tests
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

`pnpm start` prints a monthly summary and its structured capability attempt,
calculated from a deterministic fixture.
`pnpm check` typechecks and tests every workspace.

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
