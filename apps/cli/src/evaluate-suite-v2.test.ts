import assert from "node:assert/strict"
import test from "node:test"

import {
  GENERAL_LEDGER_CORPUS_TASK_IDS_V2,
  runGeneralLedgerCorpusEvaluationV2,
} from "@bound/evaluation"

test("CLI consumes the canonical twenty-task v2 corpus", async () => {
  const summary = await runGeneralLedgerCorpusEvaluationV2()

  assert.deepEqual(
    summary.tasks.map((result) => result.task.id),
    GENERAL_LEDGER_CORPUS_TASK_IDS_V2,
  )
  assert.equal(summary.aggregate.passed, true)
  assert.equal(summary.aggregate.passedTaskCount, 20)
})
