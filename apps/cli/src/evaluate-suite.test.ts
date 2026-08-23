import assert from "node:assert/strict"
import test from "node:test"

import {
  GENERAL_LEDGER_SUITE_TASK_IDS_V1,
  runGeneralLedgerSuiteEvaluation,
} from "@bound/evaluation"

test("CLI consumes the canonical five-task shared suite", async () => {
  const summary = await runGeneralLedgerSuiteEvaluation()

  assert.deepEqual(
    summary.tasks.map((result) => result.task.id),
    GENERAL_LEDGER_SUITE_TASK_IDS_V1,
  )
  assert.equal(summary.aggregate.passed, true)
  assert.equal(summary.aggregate.passedTaskCount, 5)
})
