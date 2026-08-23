import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  GENERAL_LEDGER_CORPUS_OPERATION_ORDER_V2,
  GENERAL_LEDGER_CORPUS_TASK_IDS_V2,
  GENERAL_LEDGER_CORPUS_TASKS_V2,
} from "./tasks/catalog-v2.ts"
import { GENERAL_LEDGER_SUITE_TASK_IDS_V1 } from "./tasks/catalog.ts"
import {
  aggregateGeneralLedgerCorpusV2,
  runGeneralLedgerCorpusEvaluationV2,
  scoreGeneralLedgerCorpusModeV2,
} from "./suite-v2.ts"

const withoutDurations = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === "durationMilliseconds" ? 0 : item,
    ),
  ) as unknown

const firstSummary = runGeneralLedgerCorpusEvaluationV2()

test("v2 registry is exact, semantically distinct, ordered, and deeply immutable", () => {
  assert.equal(GENERAL_LEDGER_CORPUS_TASK_IDS_V2.length, 20)
  assert.equal(new Set(GENERAL_LEDGER_CORPUS_TASK_IDS_V2).size, 20)
  assert.deepEqual(GENERAL_LEDGER_CORPUS_TASK_IDS_V2.slice(0, 3), [
    "general-ledger-reconciliation",
    "account-balance-snapshot",
    "event-detail-selection",
  ])
  assert.deepEqual(GENERAL_LEDGER_CORPUS_TASK_IDS_V2.slice(10, 14), [
    "expense-post-confirmation",
    "event-reversal-confirmation",
    "transfer-post-confirmation",
    "replacement-lineage-confirmation",
  ])
  assert.equal(
    new Set(
      GENERAL_LEDGER_CORPUS_TASKS_V2.map((task) =>
        JSON.stringify(task.toolScript),
      ),
    ).size,
    20,
  )
  assert.deepEqual(
    GENERAL_LEDGER_CORPUS_TASKS_V2.reduce(
      (counts, task) => ({
        ...counts,
        [task.outcomeClass]: counts[task.outcomeClass] + 1,
      }),
      {
        successful_read: 0,
        confirmation_required: 0,
        refused_or_invalid: 0,
      },
    ),
    {
      successful_read: 10,
      confirmation_required: 4,
      refused_or_invalid: 6,
    },
  )
  assert.equal(Object.isFrozen(GENERAL_LEDGER_CORPUS_TASKS_V2), true)
  for (const task of GENERAL_LEDGER_CORPUS_TASKS_V2) {
    assert.equal(task.version, 2)
    assert.equal(Object.isFrozen(task), true)
    assert.equal(Object.isFrozen(task.toolScript), true)
    assert.equal(Object.isFrozen(task.toolScript[0]?.arguments), true)
    assert.equal(Object.isFrozen(task.expectedAttempts), true)
  }
})

test("twenty-task corpus passes exact paired conformance repeatedly", async () => {
  const first = await firstSummary
  const second = await runGeneralLedgerCorpusEvaluationV2()

  assert.equal(first.aggregate.passed, true)
  assert.equal(first.aggregate.taskCount, 20)
  assert.equal(first.aggregate.passedTaskCount, 20)
  assert.deepEqual(first.aggregate.failedTaskIds, [])
  assert.deepEqual(first.aggregate.failedInvariantNames, [])
  assert.deepEqual(first.aggregate.outcomeClasses, {
    successfulRead: 10,
    confirmationRequired: 4,
    refusedOrInvalid: 6,
  })
  assert.deepEqual(first.aggregate.statuses, {
    completed: 10,
    confirmationRequired: 4,
    refused: 3,
    invalid: 3,
  })
  assert.deepEqual(
    first.aggregate.operationCoverage.map((entry) => entry.name),
    GENERAL_LEDGER_CORPUS_OPERATION_ORDER_V2,
  )
  assert.deepEqual(first.aggregate.attemptStageCoverage, {
    lookup: 0,
    input: 3,
    authorization: 3,
    confirmation: 4,
    execution: 0,
    output: 0,
    complete: 16,
  })
  assert.equal(first.aggregate.modeTotals.tool.outerCalls, 26)
  assert.equal(first.aggregate.modeTotals.code.outerCalls, 20)
  assert.equal(first.aggregate.modeTotals.tool.innerCapabilityCalls, 26)
  assert.equal(first.aggregate.modeTotals.code.innerCapabilityCalls, 26)
  assert.equal(first.aggregate.modeTotals.tool.mutationCalls, 7)
  assert.equal(first.aggregate.modeTotals.code.mutationCalls, 7)
  assert.deepEqual(withoutDurations(first), withoutDurations(second))
})

test("pending and failed tasks stop safely without continuation, mutation, or leakage", async () => {
  const summary = await firstSummary
  const pending = summary.tasks.filter(
    (result) => result.task.expectedStatus === "confirmation_required",
  )
  const failures = summary.tasks.filter(
    (result) => result.task.outcomeClass === "refused_or_invalid",
  )

  assert.equal(pending.length, 4)
  assert.equal(failures.length, 6)
  for (const result of pending) {
    for (const mode of [result.modes.tool, result.modes.code]) {
      assert.equal(mode.pendingConfirmationCount, 1)
      assert.equal(mode.pendingPreviewFrozen, true)
      assert.equal(mode.state.eventCountDelta, 0)
      assert.equal(mode.exposedConfirmationControl, false)
      assert.equal("continued" in mode.result, false)
    }
  }
  for (const result of failures) {
    for (const mode of [result.modes.tool, result.modes.code]) {
      assert.equal(mode.pendingConfirmationCount, 0)
      assert.equal(mode.state.eventCountDelta, 0)
      assert.equal(mode.checks.failureRedacted, true)
      assert.deepEqual(Object.keys(mode.result).sort(), [
        "code",
        "stage",
        "status",
      ])
    }
  }
})

test("mode scorer fails closed for every declared correctness and safety invariant", async () => {
  const summary = await firstSummary
  const read = summary.tasks[0]!
  const pending = summary.tasks[10]!
  const failure = summary.tasks[14]!

  const cases = [
    [
      "exactStatus",
      read.task,
      { ...read.modes.tool, status: "invalid" as const },
    ],
    [
      "exactResult",
      read.task,
      { ...read.modes.tool, result: { unexpected: true } },
    ],
    [
      "exactAttempts",
      read.task,
      { ...read.modes.tool, capabilityAttempts: [] },
    ],
    [
      "exactStateDelta",
      read.task,
      {
        ...read.modes.tool,
        state: { ...read.modes.tool.state, eventCountDelta: 1 },
      },
    ],
    [
      "exactPendingCount",
      pending.task,
      { ...pending.modes.tool, pendingConfirmationCount: 0 },
    ],
    [
      "immutablePendingBoundary",
      pending.task,
      { ...pending.modes.tool, pendingPreviewFrozen: false },
    ],
    [
      "noConfirmationControl",
      pending.task,
      { ...pending.modes.tool, exposedConfirmationControl: true },
    ],
    [
      "failureRedacted",
      failure.task,
      { ...failure.modes.tool, result: { actorId: "actor_primary_owner" } },
    ],
    [
      "boundedResult",
      read.task,
      { ...read.modes.tool, result: { value: "x".repeat(70_000) } },
    ],
  ] as const

  for (const [invariant, task, candidate] of cases) {
    const scored = scoreGeneralLedgerCorpusModeV2(task, candidate)
    assert.equal(scored.checks[invariant], false, invariant)
    assert.equal(scored.passed, false, invariant)
    assert.ok(scored.failedInvariants.includes(invariant), invariant)
  }
})

test("aggregate is conjunction-only and one failure cannot hide behind nineteen passes", async () => {
  const summary = await firstSummary
  assert.equal(aggregateGeneralLedgerCorpusV2(summary.tasks).passed, true)
  assert.equal(
    aggregateGeneralLedgerCorpusV2(summary.tasks.slice(0, 19)).passed,
    false,
  )

  const target = summary.tasks[19]!
  const failed = [
    ...summary.tasks.slice(0, 19),
    {
      ...target,
      modes: {
        ...target.modes,
        code: {
          ...target.modes.code,
          passed: false,
          failedInvariants: ["exactResult"],
        },
      },
      passed: false,
    },
  ]
  const aggregate = aggregateGeneralLedgerCorpusV2(failed)
  assert.equal(aggregate.passed, false)
  assert.deepEqual(aggregate.failedTaskIds, [target.task.id])
  assert.deepEqual(aggregate.failedInvariantNames, [
    `${target.task.id}:code.exactResult`,
  ])
})

test("v1 public IDs and checked evidence remain byte-stable", async () => {
  assert.deepEqual(GENERAL_LEDGER_SUITE_TASK_IDS_V1, [
    "general-ledger-reconciliation",
    "account-balance-snapshot",
    "event-detail-selection",
    "expense-post-confirmation",
    "event-reversal-confirmation",
  ])
  const result = await readFile(
    new URL(
      "../../../evals/results/general-ledger-suite-v1.md",
      import.meta.url,
    ),
  )
  assert.equal(
    createHash("sha256").update(result).digest("hex"),
    "ba31f06353e6112a546d26fb7f570ddd86c777821564420ced6cbbfeafd1536e",
  )
})
