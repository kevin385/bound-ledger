import assert from "node:assert/strict"
import test from "node:test"

import {
  GENERAL_LEDGER_RECONCILIATION_TASK_V1,
  runGeneralLedgerReconciliationEvaluation,
} from "@bound/evaluation"

test("CLI consumes the canonical shared reconciliation", async () => {
  const summary = await runGeneralLedgerReconciliationEvaluation()

  assert.deepEqual(
    summary.modes.tool.facts,
    GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedFacts,
  )
  assert.deepEqual(summary.modes.code.facts, summary.modes.tool.facts)
  assert.equal(summary.comparison.passed, true)
})
