# General-ledger deterministic conformance corpus v2

## Configuration

- Corpus: `general-ledger-conformance-corpus`, version 2
- Tasks: 20 unique versioned tasks in fixed registry order
- Distribution: 10 successful reads, 4 confirmation-required mutations, and
  6 refused or invalid requests
- Fixture: `sample-kernel-v1`, decoded independently for every task and mode
- Sample size: 1 deterministic run per task and mode
- Runners: fixed general-ledger tool projection and controlled QuickJS code
  bridge; no model or API key
- Captured: 2026-08-23 on Node.js 24, Darwin arm64

Run the corpus again with:

```sh
pnpm eval:suite:v2
```

The command exits unsuccessfully if the ordered registry or `10/4/6`
distribution changes; an operation loses coverage; an exact result, status,
attempt, stage, pending count, or state invariant fails; a result leaks trusted
context; the two modes diverge; or one task fails. Overall success is a
conjunction, never an average.

## Recorded task matrix

|   # | Task                             | Status                | Tool outer/inner | Code outer/inner | Mutations | Tool ms | Code ms |
| --: | -------------------------------- | --------------------- | ---------------: | ---------------: | --------: | ------: | ------: |
|   1 | General-ledger reconciliation    | completed             |              3/3 |              1/3 |         0 |   1.457 |  64.555 |
|   2 | Account/balance snapshot         | completed             |              2/2 |              1/2 |         0 |   0.381 |  61.568 |
|   3 | Event selection/detail           | completed             |              2/2 |              1/2 |         0 |   0.347 |  58.877 |
|   4 | Historical pre-June balance      | completed             |              1/1 |              1/1 |         0 |   0.186 |  59.814 |
|   5 | Empty September range            | completed             |              1/1 |              1/1 |         0 |   0.118 |  60.023 |
|   6 | August activity summary          | completed             |              1/1 |              1/1 |         0 |   0.181 |  60.949 |
|   7 | Refund event detail              | completed             |              1/1 |              1/1 |         0 |   0.169 |  58.423 |
|   8 | Half-open range boundary         | completed             |              1/1 |              1/1 |         0 |   0.176 |  59.523 |
|   9 | Historical trial balance         | completed             |              1/1 |              1/1 |         0 |   0.167 |  58.794 |
|  10 | August close composition         | completed             |              3/3 |              1/3 |         0 |   0.281 |  61.325 |
|  11 | Expense-post confirmation        | confirmation required |              1/1 |              1/1 |         1 |   0.580 |  60.760 |
|  12 | Event-reversal confirmation      | confirmation required |              1/1 |              1/1 |         1 |   0.189 |  57.536 |
|  13 | Transfer-post confirmation       | confirmation required |              1/1 |              1/1 |         1 |   0.139 |  59.735 |
|  14 | Replacement-lineage confirmation | confirmation required |              1/1 |              1/1 |         1 |   0.130 |  60.124 |
|  15 | Closed-input authority injection | invalid               |              1/1 |              1/1 |         0 |   0.841 |  59.072 |
|  16 | Invalid event-range timestamp    | invalid               |              1/1 |              1/1 |         0 |   0.361 |  59.806 |
|  17 | Inaccessible event account       | refused               |              1/1 |              1/1 |         0 |   0.251 |  60.808 |
|  18 | Unbalanced event post            | invalid               |              1/1 |              1/1 |         1 |   0.264 |  59.931 |
|  19 | Unknown-event reversal           | refused               |              1/1 |              1/1 |         1 |   0.227 |  60.544 |
|  20 | Inaccessible post authority      | refused               |              1/1 |              1/1 |         1 |   0.120 |  61.827 |

All 20 tasks passed in both modes. Totals were 26 tool outer calls versus 20
code outer calls, 26 inner capability calls per mode, and 7 mutation attempts
per mode. Timing is diagnostic: the recorded tool total was `6.565 ms`; the
code total was `1203.994 ms`, dominated by one disposable subprocess per task.

## Coverage

| Operation               | Attempts per mode |
| ----------------------- | ----------------: |
| `accounts.list`         |                 2 |
| `events.get`            |                 3 |
| `events.query`          |                 5 |
| `reports.balance`       |                 3 |
| `reports.activity`      |                 3 |
| `reports.trial_balance` |                 3 |
| `events.post`           |                 5 |
| `events.reverse`        |                 2 |

Attempt stages per mode were 16 complete, 4 confirmation, 3 input, and 3
authorization. Lookup, execution, and output remain supported normalized
failure stages but have zero tasks in this pinned corpus. Four pending programs
included catch and post-request continuation branches; the parent stopped each
program before either branch ran. Invalid and refused requests created no
pending confirmation. Every task had an event-count delta of zero, and every
failure result used only `status`, `code`, and `stage`.

This is deterministic conformance evidence for the pinned fixture, gateway,
tool projection, manifest, and sandbox bridge. It is not a live-model benchmark
and does not establish correctness, safety, cost, latency, or a general
advantage for either orchestration mode.
