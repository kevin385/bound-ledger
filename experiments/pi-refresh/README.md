# Pi 1.0.2 integration spike

Exploratory evidence for [the rewrite assessment](../../docs/REWRITE_ASSESSMENT.md).
This does not replace the existing implementation or claim production isolation.
It uses synthetic rows, no model calls, and no credentials.

Install into a temporary directory so the current workspace dependencies stay
unchanged. Run these commands from the repository root:

```sh
spike_dir=$(mktemp -d)
cp experiments/pi-refresh/spike.mjs "$spike_dir/spike.mjs"
npm install --prefix "$spike_dir" --ignore-scripts --no-audit --no-fund --save-exact \
  @earendil-works/pi-codemode@1.0.2 \
  @earendil-works/pi-durable@1.0.2 \
  @earendil-works/pi-ai@1.0.2 \
  @earendil-works/chord@1.0.2
node "$spike_dir/spike.mjs"
```

Direct dependencies are pinned; this experiment does not lock their transitive
dependencies. Tested on Node 24.20.0 on 5 October 2026.

The script checks:

- the guest lacks `fetch`, `process`, `require`, and an uninstalled posting tool;
- the host rejects invalid arguments even when a schema is declared;
- a host draft persists when the script later fails;
- a failed script returns no `storeWrites`;
- an infinite loop hits an explicit deadline;
- a child process writes a proposal and next-phase checkpoint together in SQLite,
  is killed with SIGKILL without closing the harness, and a second process
  completes the task with exactly one pending proposal.

The last check covers recovery **after** a committed phase, not an interrupted
nested tool call, a model request, a human approval, or an external database write.
The scope check is not an escape-resistance assessment. Successful recovery is
not proof of exactly-once external effects.

Expected result:

```json
{
  "versions": "1.0.2",
  "checks": [
    "guest_scope",
    "host_validation",
    "host_effect_survives_script_failure",
    "failed_store_not_committed",
    "loop_timeout",
    "sqlite_sigkill_recovery"
  ],
  "killedAfterCommit": true,
  "recovered": true,
  "proposals": 1,
  "outcome": { "status": "awaiting_review" }
}
```
