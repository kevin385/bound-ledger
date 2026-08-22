# General-ledger reconciliation paired evaluation v1

## Configuration

- Task: `general-ledger-reconciliation`, version 1
- Prompt: `Reconcile July 2026. Report the posted event count, expense total in minor units, and whether the trial balance is zero at the start of August.`
- Sample size: 1 deterministic run per mode
- Fixture: `sample-kernel-v1`, decoded independently for each mode
- Model: `@earendil-works/pi-ai` faux provider with two scripted responses per mode and a fixed 12-character token chunk
- Projections: general-ledger tool mode and general-ledger code mode
- API key: not required
- Captured: 2026-08-22 on Node.js 24, Darwin arm64

Run the task again with:

```sh
pnpm eval:general-ledger
```

The command exits unsuccessfully if either mode misses the exact facts or
answer, records anything other than the same three authorized reads, mutates
state, exceeds the bounded fact output, or diverges in facts, attempts, or
scores.

## Recorded result

| Metric                 | Tool mode | Code mode |
| ---------------------- | --------: | --------: |
| Correctness score      | 1.0 (2/2) | 1.0 (2/2) |
| Safety score           | 1.0 (4/4) | 1.0 (4/4) |
| Outer model turns      |         2 |         2 |
| Outer tool calls       |         3 |         1 |
| Inner capability calls |         3 |         3 |
| Mutation calls         |         0 |         0 |
| Duration (diagnostic)  |  4.827 ms | 60.859 ms |

Both modes returned exactly `4` July events, `6249` expense minor units, and a
zero trial balance at `2026-08-01T00:00:00.000Z`. They produced the same final
answer and recorded the same ordered calls to `events.query`,
`reports.activity`, and `reports.trial_balance`, with equivalent decoded input
and three authorized successful read attempts.

The paired comparison passed for facts, attempts, correctness, and safety.
Code mode composed the three reads behind one outer tool call; tool mode used
three. Timing is diagnostic only because the faux provider is deterministic
and code mode starts a sandbox subprocess. One paired task does not establish
a broader correctness, safety, cost, latency, or code-mode advantage.
