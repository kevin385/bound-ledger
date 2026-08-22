import assert from "node:assert/strict"
import test from "node:test"

import {
  GENERAL_LEDGER_RECONCILIATION_TASK_V1,
  runGeneralLedgerReconciliationEvaluation,
} from "@bound/evaluation"

import {
  createComparisonView,
  projectComparisonSummary,
} from "./comparison/application.server.ts"
import { decodeEmptyInput } from "./ledger/contracts.ts"

const collectKeys = (value: unknown, keys = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key)
      collectKeys(item, keys)
    }
  }
  return keys
}

test("server projection matches the canonical evaluation and redacts trust context", async () => {
  const summary = await runGeneralLedgerReconciliationEvaluation()
  const view = projectComparisonSummary(summary)
  const keys = collectKeys(view)

  assert.deepEqual(view.modes.tool.facts, summary.modes.tool.facts)
  assert.deepEqual(view.modes.code.facts, summary.modes.code.facts)
  assert.deepEqual(
    view.modes.tool.facts,
    GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedFacts,
  )
  assert.deepEqual(
    view.modes.tool.attempts.map((attempt) => attempt.name),
    view.modes.code.attempts.map((attempt) => attempt.name),
  )
  assert.equal(view.modes.tool.metrics.outerToolCalls, 3)
  assert.equal(view.modes.code.metrics.outerToolCalls, 1)
  for (const forbidden of [
    "actorId",
    "activeWorkspaceId",
    "activeLedgerId",
    "readableAccountIds",
    "mutableAccountIds",
    "decodedInput",
    "confirmationId",
    "provider",
  ]) {
    assert.equal(keys.has(forbidden), false)
  }
  assert.ok(Buffer.byteLength(JSON.stringify(view), "utf8") < 64 * 1024)
})

test("fresh server comparisons reset their evaluation and sandbox state", async () => {
  const first = await createComparisonView()
  const second = await createComparisonView()

  assert.deepEqual(first.modes.tool.facts, second.modes.tool.facts)
  assert.deepEqual(first.modes.code.attempts, second.modes.code.attempts)
  assert.equal(first.comparison.passed, true)
  assert.equal(second.comparison.passed, true)
})

test("comparison accepts only the closed empty server input", () => {
  assert.deepEqual(decodeEmptyInput({}), {})
  assert.throws(() => decodeEmptyInput({ program: "return process.env" }))
  assert.throws(() => decodeEmptyInput({ actorId: "browser-actor" }))
})
