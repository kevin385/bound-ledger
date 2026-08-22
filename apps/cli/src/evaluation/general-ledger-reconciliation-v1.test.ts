import test from "node:test"
import assert from "node:assert/strict"

import {
  GENERAL_LEDGER_RECONCILIATION_TASK_V1,
  assertReconciliationEvaluation,
  compareReconciliationResults,
  runGeneralLedgerReconciliationEvaluation,
  scoreReconciliationMode,
} from "./general-ledger-reconciliation-v1.ts"

test("general-ledger reconciliation v1 produces exact paired evidence", async () => {
  const summary = await runGeneralLedgerReconciliationEvaluation()

  assert.equal(summary.schemaVersion, 1)
  assert.deepEqual(
    summary.modes.tool.facts,
    GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedFacts,
  )
  assert.deepEqual(
    summary.modes.code.facts,
    GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedFacts,
  )
  assert.equal(summary.modes.tool.metrics.outerToolCalls, 3)
  assert.equal(summary.modes.code.metrics.outerToolCalls, 1)
  assert.equal(summary.modes.tool.metrics.innerCapabilityCalls, 3)
  assert.equal(summary.modes.code.metrics.innerCapabilityCalls, 3)
  assert.equal(summary.modes.code.metrics.mutationCalls, 0)
  assert.deepEqual(summary.comparison, {
    passed: true,
    sameFacts: true,
    sameAttempts: true,
    sameScores: true,
  })
  assert.doesNotThrow(() => assertReconciliationEvaluation(summary))
})

test("comparison fails closed when one mode diverges", () => {
  const base = scoreReconciliationMode({
    mode: "tool",
    finalAnswer: GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedAnswer,
    facts: GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedFacts,
    capabilityAttempts: [],
    metrics: {
      outerModelTurns: 2,
      outerToolCalls: 3,
      innerCapabilityCalls: 3,
      mutationCalls: 0,
      durationMilliseconds: 1,
    },
  })
  const divergent = {
    ...base,
    mode: "code" as const,
    facts: { ...base.facts, eventCount: 99 },
  }

  assert.equal(compareReconciliationResults(base, divergent).passed, false)
})
