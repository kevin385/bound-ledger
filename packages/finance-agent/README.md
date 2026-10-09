# Finance agent bootstrap

`createOperationFacade(ledger)` exposes only the existing core public operations,
with authority already bound by the host's Ledger instance. Inputs still cross
core validation. It does not expose a database handle, SQL or filesystem APIs.

No Pi harness, durable task, provider adapter, model, code executor, sandbox,
cancellation or replay-safety integration is implemented. This root establishes
the independent package/type boundary only. See [the slice contract](../../docs/FINANCE_SLICE.md).

```sh
pnpm --filter @bound/finance-agent build
pnpm --filter @bound/finance-agent check
```
