# Contributing to Bound Ledger

Bound Ledger is currently an early research project. Small, evidence-backed
changes are preferred over framework expansion.

The possible long-term direction is an open-source, self-hostable,
model-agnostic personal-finance workspace, but future product intent does not
authorize later-phase code. The current implementation boundary remains the
one named in `docs/INITIAL_PLAN.md`.

## Choosing work

Read [docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md) before changing code. It is the
authoritative implementation order and identifies the current phase. Work from
later phases should not be scaffolded early, even when it appears in the target
architecture in [PLAN.md](PLAN.md).

Use the ownership and non-goals declared by the current phase. Do not add a
package, agent, cloud resource, database, UI, or sandbox until the corresponding
phase gate is complete.

Phase 16 is complete. Phase 17 is currently planned. Contributions should
begin by defining the closed five-task deterministic suite contract and exact
per-task scorers, then add paired tool/code runners and one aggregate CLI
result. Keep the existing reconciliation task and `/comparison` route green.
Do not add live models, editable prompts or generated-program input,
persistence, CSV/bank ingestion, model-provider adapters, API-key storage,
self-hosting infrastructure, or trusted confirmation controls as part of Phase 17.

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

If a change alters a public command, workspace, capability catalog, sandbox
contract, security boundary, or phase exit condition, update the README and
affected plan/threat-model/ADR documentation in the same pull request. Keep
descriptions explicit about what is implemented versus only planned.

## Financial and model data

- Use only deterministic, synthetic fixtures committed for that purpose.
- Never commit real statements, account identifiers, access tokens, API keys,
  prompts containing personal financial data, or model-provider responses that
  contain user data.
- Deterministic tests must remain runnable without a model or API key.
- Live-model tests, when a later phase permits them, must be opt-in and excluded
  from ordinary CI.
- Do not add a provider or source connector before its trusted context,
  disclosure, secret handling, failure behavior, and conformance tests are
  documented.

## Clean-room contributions

Contributions must be independently implemented. Do not submit code, schemas,
tests, prompts, private paths, naming catalogs, or product abstractions copied
from another private or proprietary system.

## Security

Do not report vulnerabilities publicly. Follow [SECURITY.md](SECURITY.md).

By contributing, you agree that your contribution is licensed under the
Apache License 2.0.
