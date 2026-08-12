# Contributing to Bound Ledger

Bound Ledger is currently an early research project. Small, evidence-backed
changes are preferred over framework expansion.

## Choosing work

Read [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md) before changing code. It is the
authoritative implementation order and identifies the current phase. Work from
later phases should not be scaffolded early, even when it appears in the target
architecture in [PLAN.md](PLAN.md).

Use the ownership and non-goals declared by the current phase. Do not add a
package, agent, cloud resource, database, UI, or sandbox until the corresponding
phase gate is complete.

## Development

Requirements:

- Node.js 24 or newer;
- pnpm 11.18.0 or compatible.

Run:

```sh
pnpm install
pnpm check
pnpm start
```

Keep tests beside the behavior they verify and keep dependencies flowing from
applications toward packages.

Before opening a pull request:

```sh
pnpm check
pnpm start
```

If a pull request completes a phase, update the **Current phase** marker in
`docs/INITIAL_PLAN.md` in the same change.

## Clean-room contributions

Contributions must be independently implemented. Do not submit code, schemas,
tests, prompts, private paths, naming catalogs, or product abstractions copied
from another private or proprietary system.

## Security

Do not report vulnerabilities publicly. Follow [SECURITY.md](SECURITY.md).

By contributing, you agree that your contribution is licensed under the
Apache License 2.0.
