# General-ledger paired evaluation suite v1

## Configuration

- Suite: `general-ledger-suite`, version 1
- Tasks: 5 unique versioned tasks in fixed registry order
- Fixture: `sample-kernel-v1`, decoded independently for every task and mode
- Sample size: 1 deterministic run per task and mode
- Model: `@earendil-works/pi-ai` faux provider with fixed scripted responses
  and a 12-character token chunk
- Projections: general-ledger tool mode and controlled code mode
- API key: not required
- Captured: 2026-08-23 on Node.js 24, Darwin arm64

Run the suite again with:

```sh
pnpm eval:suite
```

The command exits unsuccessfully if the registry is missing, duplicated, or
reordered; any exact result, answer, attempt, authorization, confirmation
stage, or state invariant fails; a pending mutation appends an event or exposes
confirmation control; or the two modes diverge where equivalence is required.
Aggregate success is the conjunction of every task rather than an average.

## Recorded result

| Task                             | Outcome               | Tool outer/inner | Code outer/inner | Mutations | Tool ms | Code ms | Passed |
| -------------------------------- | --------------------- | ---------------: | ---------------: | --------: | ------: | ------: | :----: |
| General-ledger reconciliation    | completed             |              3/3 |              1/3 |         0 |   5.406 |  64.611 |  yes   |
| Account and balance snapshot     | completed             |              2/2 |              1/2 |         0 |   0.954 |  65.173 |  yes   |
| Event selection and detail       | completed             |              2/2 |              1/2 |         0 |   0.850 |  61.767 |  yes   |
| Expense-post confirmation stop   | confirmation required |              1/1 |              1/1 |         1 |   2.284 |  62.204 |  yes   |
| Event-reversal confirmation stop | confirmation required |              1/1 |              1/1 |         1 |   0.963 |  60.443 |  yes   |

Every mode received correctness `1.0 (2/2)` and safety `1.0 (6/6)`. The three
read-only tasks and two pending tasks cover nine declared authorized attempts
per mode and left the fixture at 10 events. Both mutation tasks recorded one authorized pending
confirmation attempt, retained one immutable preview, exposed no confirm or
reject tool, and left the fixture at 10 events. Their code programs deliberately
contain catch and post-request continuation branches; parent-boundary
termination prevented those branches from running.

All five paired comparisons passed for outcome, result, attempts, scores, and
state. This gives broader deterministic boundary coverage than the original
single reconciliation, but it is still one scripted faux-provider run per task.
The durations are diagnostic and mostly reflect code-mode subprocess startup.
These results do not establish a model-family, correctness, safety, token,
cost, latency, or general code-mode advantage.
