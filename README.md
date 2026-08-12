# Bound

Bound explores a simple idea: application-owned operations should remain the
authority whether an AI invokes them as tools or through generated code.

The repository is deliberately starting as a small Effect v4 monorepo. It is
not a framework and does not yet contain agent, sandbox, database, or UI code.

```text
apps/cli          runnable composition root
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

`pnpm start` prints a monthly summary calculated from a deterministic fixture.
`pnpm check` typechecks and tests every workspace.

## Project status

Bound is pre-alpha research software. It is not a production security boundary
and should not process real financial data or untrusted generated code.

Please report security issues through GitHub's private vulnerability reporting
flow described in [SECURITY.md](SECURITY.md).

## Next step

Read [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md). It defines the dependency
rules, the few architectural lessons adopted from prior systems, and the order
in which new packages may be introduced.

## License

Apache-2.0. See [LICENSE](LICENSE).
