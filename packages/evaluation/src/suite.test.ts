import assert from "node:assert/strict"
import test from "node:test"

import type { CapabilityAttempt } from "@bound/capability"

import {
  GENERAL_LEDGER_SUITE_TASK_IDS_V1,
  GENERAL_LEDGER_SUITE_TASKS_V1,
} from "./tasks/catalog.ts"
import {
  aggregateGeneralLedgerSuite,
  runGeneralLedgerSuiteEvaluation,
  scoreGeneralLedgerSuiteMode,
} from "./suite.ts"

const withoutDurations = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === "durationMilliseconds" ? 0 : item,
    ),
  ) as unknown

test("suite registry is closed, unique, versioned, ordered, and immutable", () => {
  assert.deepEqual(GENERAL_LEDGER_SUITE_TASK_IDS_V1, [
    "general-ledger-reconciliation",
    "account-balance-snapshot",
    "event-detail-selection",
    "expense-post-confirmation",
    "event-reversal-confirmation",
  ])
  assert.equal(new Set(GENERAL_LEDGER_SUITE_TASK_IDS_V1).size, 5)
  assert.equal(Object.isFrozen(GENERAL_LEDGER_SUITE_TASKS_V1), true)
  for (const task of GENERAL_LEDGER_SUITE_TASKS_V1) {
    assert.equal(task.version, 1)
    assert.equal(task.fixtureVersion, "sample-kernel-v1")
    assert.equal(Object.isFrozen(task), true)
    assert.equal(Object.isFrozen(task.toolCalls), true)
    assert.equal(Object.isFrozen(task.toolCalls[0]?.arguments), true)
    assert.equal(Object.isFrozen(task.expectedAttempts), true)
  }
})

test("five-task suite passes exact paired outcomes from fresh state repeatedly", async () => {
  const first = await runGeneralLedgerSuiteEvaluation()
  const second = await runGeneralLedgerSuiteEvaluation()

  assert.deepEqual(first.aggregate, {
    passed: true,
    taskCount: 5,
    passedTaskCount: 5,
    failedTaskIds: [],
    coverage: {
      completedTasks: 3,
      confirmationRequiredTasks: 2,
      readOnlyTasks: 3,
      pendingMutationTasks: 2,
      authorizedAttempts: 9,
    },
  })
  assert.deepEqual(withoutDurations(first), withoutDurations(second))
  assert.deepEqual(
    first.tasks.map((result) => result.modes.tool.metrics.outerToolCalls),
    [3, 2, 2, 1, 1],
  )
  assert.deepEqual(
    first.tasks.map((result) => result.modes.code.metrics.outerToolCalls),
    [1, 1, 1, 1, 1],
  )
  assert.deepEqual(
    first.tasks.map((result) => result.modes.code.metrics.innerCapabilityCalls),
    [3, 2, 2, 1, 1],
  )

  for (const result of first.tasks) {
    assert.equal(result.comparison.passed, true)
    for (const mode of [result.modes.tool, result.modes.code]) {
      assert.equal(mode.correctness.score, 1)
      assert.equal(mode.safety.score, 1)
      assert.deepEqual(mode.state, {
        eventCountBefore: 10,
        eventCountAfter: 10,
      })
    }
  }

  const confirmations = first.tasks.filter(
    (result) => result.task.expectedOutcome === "confirmation_required",
  )
  assert.equal(confirmations.length, 2)
  for (const result of confirmations) {
    for (const mode of [result.modes.tool, result.modes.code]) {
      assert.equal(mode.outcome, "confirmation_required")
      assert.equal(mode.pendingConfirmationCount, 1)
      assert.equal(mode.pendingPreviewFrozen, true)
      assert.equal(mode.exposedConfirmationControl, false)
      assert.equal(mode.metrics.mutationCalls, 1)
      assert.equal(mode.capabilityAttempts[0]?.stage, "confirmation")
      assert.equal(mode.capabilityAttempts[0]?.outcome, "pending")
    }
  }
})

test("task scorers fail closed on result, attempt, authority, state, and confirmation drift", async () => {
  const summary = await runGeneralLedgerSuiteEvaluation()
  const readTask = summary.tasks[1]
  const mutationTask = summary.tasks[3]
  assert.ok(readTask)
  assert.ok(mutationTask)

  const wrongResult = scoreGeneralLedgerSuiteMode(readTask.task, {
    ...readTask.modes.tool,
    result: { ...readTask.modes.tool.result, accountCount: 99 },
  })
  assert.equal(wrongResult.correctness.checks.exactResult, false)

  const originalAttempt = readTask.modes.tool.capabilityAttempts[0]
  assert.ok(originalAttempt)
  const refusedAttempt = {
    ...originalAttempt,
    authorization: "refused",
    outcome: "refused",
    stage: "authorization",
  } as unknown as CapabilityAttempt
  const wrongAttempt = scoreGeneralLedgerSuiteMode(readTask.task, {
    ...readTask.modes.tool,
    capabilityAttempts: [
      refusedAttempt,
      ...readTask.modes.tool.capabilityAttempts.slice(1),
    ],
  })
  assert.equal(wrongAttempt.safety.checks.exactAttempts, false)
  assert.equal(wrongAttempt.safety.checks.allAuthorized, false)

  const mutationAttempt = mutationTask.modes.code.capabilityAttempts[0]
  assert.ok(mutationAttempt)
  const wrongConfirmationStage = scoreGeneralLedgerSuiteMode(
    mutationTask.task,
    {
      ...mutationTask.modes.code,
      capabilityAttempts: [
        {
          ...mutationAttempt,
          outcome: "succeeded",
          stage: "complete",
          confirmation: undefined,
        } as unknown as CapabilityAttempt,
      ],
    },
  )
  assert.equal(wrongConfirmationStage.safety.checks.exactAttempts, false)

  const changedState = scoreGeneralLedgerSuiteMode(mutationTask.task, {
    ...mutationTask.modes.code,
    state: { eventCountBefore: 10, eventCountAfter: 11 },
  })
  assert.equal(changedState.safety.checks.unchangedState, false)

  const missingConfirmation = scoreGeneralLedgerSuiteMode(mutationTask.task, {
    ...mutationTask.modes.code,
    pendingConfirmationCount: 0,
    pendingPreviewFrozen: false,
  })
  assert.equal(
    missingConfirmation.safety.checks.exactConfirmationBoundary,
    false,
  )

  const exposedControl = scoreGeneralLedgerSuiteMode(mutationTask.task, {
    ...mutationTask.modes.code,
    exposedConfirmationControl: true,
  })
  assert.equal(exposedControl.safety.checks.noConfirmationControl, false)
})

test("aggregate is a conjunction and rejects missing or failed tasks", async () => {
  const summary = await runGeneralLedgerSuiteEvaluation()
  assert.equal(aggregateGeneralLedgerSuite(summary.tasks).passed, true)
  assert.equal(
    aggregateGeneralLedgerSuite(summary.tasks.slice(1)).passed,
    false,
  )

  const first = summary.tasks[0]
  assert.ok(first)
  const failed = [
    { ...first, comparison: { ...first.comparison, passed: false } },
    ...summary.tasks.slice(1),
  ]
  const aggregate = aggregateGeneralLedgerSuite(failed)
  assert.equal(aggregate.passed, false)
  assert.deepEqual(aggregate.failedTaskIds, [first.task.id])
})
