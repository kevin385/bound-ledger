# Contributing to Bound Ledger

Bound Ledger is starting an independent replacement of its research prototype.
Read [PLAN.md](PLAN.md) for the financial concepts and product purpose, then
[docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md) for the current step and exit criteria.
R0 is bootstrapped and a first persistent expense slice through R1/R2 works;
[docs/FINANCE_SLICE.md](docs/FINANCE_SLICE.md) records its contracts and limits.
Broader R1/R2 and R3/R4 are not complete. Archived research plans are historical;
their phase gates do not apply to new work.

## Choosing work

Build useful slices of a financial system: record a fact, preserve its meaning,
understand its effects, correct it, and let an agent operate the same behavior.
Do not shape the model around a note layout, CSV import, reconciliation workflow,
or tool/code benchmark. Ordinary recording should be simple and recoverable.

The new roots are `apps/finance`, `packages/finance-core`, and
`packages/finance-agent` (bootstrap facade only, no Pi runtime). Keep source independent of
`apps/cli`, `apps/personal-ledger`, and all five existing runtime packages.
Do not import or copy their implementations into a new wrapper. Shared tooling
and public third-party dependencies are allowed; implement relevant invariants
and tests independently in the new domain.

Existing source remains runnable only until R0–R4 pass the initial-base gate.
Then remove it entirely through R5, including its tests, fixtures, commands,
unused dependencies, and CI wiring. Compatibility with old APIs, schema, UI, or
benchmark outputs is not a contribution requirement. Do not delete it before
the base is demonstrated; do not keep a legacy mode after cutover.

## Contribution scope and practices

- Keep one application, one financial core, and one thin Pi adapter initially.
  New packages need an actual boundary or a second consumer.
- Keep domain calculations and validation independent of Pi and the UI.
- Use the same public operations from human controls, tools, and code mode.
- Derive authority in the host; do not accept it from model arguments.
- Preserve uncertainty, ownership, currency, date precision, and source evidence.
  Do not invent facts, and do not count linked effects twice.
- Financial writes need atomic effects/revisions/receipts. Test the retry gap
  between domain persistence and assistant result persistence.
- Use upstream Pi durable/codemode instead of implementing another harness or
  sandbox; verify their boundaries and pin the tested releases.
- Keep tests beside behavior, with deterministic synthetic data and no required
  provider calls. Test real invariants and completed user workflows.
- Update the current-step marker and documentation when a slice is completed.
  State what exists versus what is merely planned.

## Development during the transition

The current repository requires Node.js 24+ and pnpm 11.18.0 or compatible.
These retained commands operate the existing research implementation (the
repository-wide check also includes the new roots):

```sh
pnpm install
pnpm check
pnpm start
```

The new manual slice has independent commands and a separate CI job:

```sh
pnpm build:finance
pnpm check:finance
pnpm --filter @bound/finance exec playwright install chromium
pnpm test:e2e:finance
pnpm dev:finance
```

The tested runtime baseline is Node 24.11.1; CI also covers 26.10.0. New package
scripts build their public core dependency before checking/running consumers.
Checks use synthetic temporary databases and no provider, key or live model.
The current CI still builds/tests the old browser application. Keep its wiring
and assertions intact; separate any already-known failures from regressions.
Keep old checks passing while code remains;
do not make the replacement inherit old fixtures or frozen research evaluations.
For documentation-only changes, check relative links, conflicting status text,
commands against package scripts, and diff whitespace. Unchanged application
behavior does not require rerunning every old evaluation.

Before committing code, run the checks required by the slice and the checks
covering any shared configuration changed. Keep tests and builds network-free;
a live provider test must be explicitly configured and opted into. No new
command listed as planned should be represented as runnable before it exists.

## Data, models, and security

Never commit real finance notes, statements, account identifiers, credentials,
provider responses containing user data, or local agent state. Use synthetic
fixtures even when a user's example motivates a feature. Keep private runtime
data outside source control and document backup/restore and migration behavior.

Disclose provider and data scope before transmitting financial data. Model
configuration and secrets belong to host configuration, not prompts or generated
code. A record-save request does not authorize money movement; external actions
are outside the initial base. See [SECURITY.md](SECURITY.md).

## Independent implementation and license

Public documentation can inform architecture and missed failure modes. Do not
copy private/proprietary code, schemas, prompts, naming catalogs, or abstractions.
The new implementation is owned by this project; third-party packages retain
their licenses. Contributions are licensed under Apache-2.0.

Report vulnerabilities privately through the process in [SECURITY.md](SECURITY.md).
