import { Buffer } from "node:buffer"
import { performance } from "node:perf_hooks"

import { Effect } from "effect"

import type {
  CapabilityAttempt,
  CapabilityAttemptStage,
  ConfirmationRequest,
} from "@bound/capability"
import {
  executeCode,
  GENERAL_LEDGER_CODE_MODE_MANIFEST,
  type CodeModeRunResult,
} from "@bound/code-mode"
import { projectGeneralLedgerTools } from "@bound/pi-adapter"

import { makeFreshEvaluationGateway } from "./runtime.ts"
import {
  GENERAL_LEDGER_CORPUS_OPERATION_ORDER_V2,
  GENERAL_LEDGER_CORPUS_TASKS_V2,
  type GeneralLedgerCorpusStatusV2,
  type GeneralLedgerCorpusTaskV2,
} from "./tasks/catalog-v2.ts"

export interface GeneralLedgerCorpusMetricsV2 {
  readonly outerCalls: number
  readonly innerCapabilityCalls: number
  readonly mutationCalls: number
  readonly durationMilliseconds: number
}

export interface GeneralLedgerCorpusModeCandidateV2 {
  readonly mode: "tool" | "code"
  readonly status: GeneralLedgerCorpusStatusV2
  readonly result: Readonly<Record<string, unknown>>
  readonly capabilityAttempts: ReadonlyArray<CapabilityAttempt>
  readonly state: {
    readonly eventCountBefore: number
    readonly eventCountAfter: number
    readonly eventCountDelta: number
  }
  readonly pendingConfirmationCount: number
  readonly pendingPreviewFrozen: boolean
  readonly exposedConfirmationControl: boolean
  readonly metrics: GeneralLedgerCorpusMetricsV2
}

export interface GeneralLedgerCorpusModeResultV2 extends GeneralLedgerCorpusModeCandidateV2 {
  readonly checks: Readonly<Record<string, boolean>>
  readonly failedInvariants: ReadonlyArray<string>
  readonly passed: boolean
}

export interface GeneralLedgerCorpusComparisonV2 {
  readonly passed: boolean
  readonly checks: {
    readonly sameStatus: boolean
    readonly sameResult: boolean
    readonly sameAttempts: boolean
    readonly sameState: boolean
    readonly samePendingCount: boolean
  }
  readonly failedInvariants: ReadonlyArray<string>
}

export interface GeneralLedgerCorpusTaskResultV2 {
  readonly task: GeneralLedgerCorpusTaskV2
  readonly modes: {
    readonly tool: GeneralLedgerCorpusModeResultV2
    readonly code: GeneralLedgerCorpusModeResultV2
  }
  readonly comparison: GeneralLedgerCorpusComparisonV2
  readonly passed: boolean
}

export interface GeneralLedgerCorpusAggregateV2 {
  readonly passed: boolean
  readonly taskCount: number
  readonly passedTaskCount: number
  readonly failedTaskIds: ReadonlyArray<string>
  readonly failedInvariantNames: ReadonlyArray<string>
  readonly outcomeClasses: {
    readonly successfulRead: number
    readonly confirmationRequired: number
    readonly refusedOrInvalid: number
  }
  readonly statuses: {
    readonly completed: number
    readonly confirmationRequired: number
    readonly refused: number
    readonly invalid: number
  }
  readonly operationCoverage: ReadonlyArray<{
    readonly name: string
    readonly attemptsPerMode: number
  }>
  readonly attemptStageCoverage: Readonly<
    Record<CapabilityAttemptStage, number>
  >
  readonly modeTotals: {
    readonly tool: GeneralLedgerCorpusMetricsV2
    readonly code: GeneralLedgerCorpusMetricsV2
  }
}

export interface GeneralLedgerCorpusSummaryV2 {
  readonly schemaVersion: 2
  readonly corpus: {
    readonly id: "general-ledger-conformance-corpus"
    readonly version: 2
    readonly fixtureVersion: "sample-kernel-v1"
    readonly taskCount: 20
    readonly sampleSizePerMode: 1
    readonly runner: "fixed tool projection and controlled code bridge"
  }
  readonly tasks: ReadonlyArray<GeneralLedgerCorpusTaskResultV2>
  readonly aggregate: GeneralLedgerCorpusAggregateV2
  readonly timingNote: string
  readonly conclusion: string
}

export class GeneralLedgerCorpusEvaluationErrorV2 extends Error {
  override readonly name = "GeneralLedgerCorpusEvaluationErrorV2"
}

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GeneralLedgerCorpusEvaluationErrorV2("Expected an object result")
  }
  return value as Record<string, unknown>
}

const asArray = (value: unknown): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) {
    throw new GeneralLedgerCorpusEvaluationErrorV2("Expected an array result")
  }
  return value
}

const amountFor = (balances: unknown, accountId: string): unknown =>
  asArray(balances)
    .map(asRecord)
    .find((balance) => balance.accountId === accountId)?.amountMinor

const projectReadResult = (
  task: GeneralLedgerCorpusTaskV2,
  outputs: ReadonlyArray<unknown>,
): Readonly<Record<string, unknown>> => {
  if (task.projection === "reconciliation") {
    const events = asArray(outputs[0])
    const activity = asRecord(outputs[1])
    const trial = asRecord(outputs[2])
    return {
      eventCount: events.length,
      expenseTotalMinor: activity.expenseTotalMinor,
      trialBalanceZero: trial.totalMinor === 0,
    }
  }
  if (task.projection === "account_balance") {
    return {
      accountCount: asArray(outputs[0]).length,
      balanceCount: asArray(outputs[1]).length,
      checkingBalanceMinor: amountFor(outputs[1], "acct_checking"),
    }
  }
  if (task.projection === "event_detail") {
    const event = asRecord(outputs[1])
    return {
      julyEventCount: asArray(outputs[0]).length,
      eventId: event.id,
      eventKind: event.kind,
    }
  }
  if (task.projection === "historical_balance") {
    const balances = asArray(outputs[0])
    return {
      checkingBalanceMinor: amountFor(balances, "acct_checking"),
      incomeBalanceMinor: amountFor(balances, "acct_income"),
      nonZeroBalanceCount: balances
        .map(asRecord)
        .filter((balance) => balance.amountMinor !== 0).length,
    }
  }
  if (task.projection === "empty_range") {
    const events = asArray(outputs[0]).map(asRecord)
    return {
      eventCount: events.length,
      eventIds: events.map((event) => event.id),
    }
  }
  if (task.projection === "august_activity") {
    const activity = asRecord(outputs[0])
    const events = asArray(activity.events).map(asRecord)
    return {
      eventCount: events.length,
      eventIds: events.map((event) => event.id),
      expenseTotalMinor: activity.expenseTotalMinor,
    }
  }
  if (task.projection === "single_event") {
    const event = asRecord(outputs[0])
    return {
      eventId: event.id,
      eventKind: event.kind,
      checkingAmountMinor: amountFor(event.postings, "acct_checking"),
      groceryAmountMinor: amountFor(event.postings, "acct_groceries"),
    }
  }
  if (task.projection === "range_boundary") {
    const events = asArray(outputs[0]).map(asRecord)
    return {
      eventCount: events.length,
      eventIds: events.map((event) => event.id),
      excludedUpperBoundary: !events.some((event) => event.id === "evt_004"),
    }
  }
  if (task.projection === "historical_trial") {
    const trial = asRecord(outputs[0])
    const balances = asArray(trial.balances)
    return {
      totalMinor: trial.totalMinor,
      nonZeroBalanceCount: balances
        .map(asRecord)
        .filter((balance) => balance.amountMinor !== 0).length,
      checkingBalanceMinor: amountFor(balances, "acct_checking"),
    }
  }
  if (task.projection === "august_close") {
    const activity = asRecord(outputs[1])
    const trial = asRecord(outputs[2])
    return {
      checkingBalanceMinor: amountFor(outputs[0], "acct_checking"),
      augustEventCount: asArray(activity.events).length,
      augustExpenseTotalMinor: activity.expenseTotalMinor,
      trialBalanceZero: trial.totalMinor === 0,
    }
  }
  throw new GeneralLedgerCorpusEvaluationErrorV2(
    `${task.id} does not declare a read-result projection`,
  )
}

const projectAttempt = (attempt: CapabilityAttempt) => ({
  name: attempt.name,
  ...(attempt.kind === undefined ? {} : { kind: attempt.kind }),
  authorization: attempt.authorization,
  outcome: attempt.outcome,
  stage: attempt.stage,
  ...(attempt.confirmation === undefined
    ? {}
    : { confirmation: attempt.confirmation }),
  ...(attempt.errorTag === undefined ? {} : { errorTag: attempt.errorTag }),
})

const confirmationResult = (request: ConfirmationRequest) => ({
  status: "confirmation_required",
  capabilityName: request.capabilityName,
  confirmationId: request.id,
  idempotencyKey: asRecord(request.decodedInput).idempotencyKey,
})

const normalizeFailure = (
  attempt: CapabilityAttempt | undefined,
): Readonly<Record<string, unknown>> => {
  if (attempt === undefined) {
    throw new GeneralLedgerCorpusEvaluationErrorV2(
      "A failed run produced no authoritative capability attempt",
    )
  }
  if (attempt.stage === "input") {
    return { status: "invalid", code: "invalid_input", stage: "input" }
  }
  if (attempt.errorTag === "EventNotFoundError") {
    return {
      status: "refused",
      code: "resource_unavailable",
      stage: attempt.stage,
    }
  }
  if (attempt.authorization === "refused") {
    return {
      status: "refused",
      code: "authorization_refused",
      stage: attempt.stage,
    }
  }
  const code =
    attempt.stage === "lookup"
      ? "unknown_capability"
      : attempt.stage === "output"
        ? "invalid_output"
        : "execution_failed"
  return { status: "invalid", code, stage: attempt.stage }
}

const statusFromResult = (
  result: Readonly<Record<string, unknown>>,
): GeneralLedgerCorpusStatusV2 => {
  const status = result.status
  return status === "confirmation_required" ||
    status === "refused" ||
    status === "invalid"
    ? status
    : "completed"
}

const forbiddenResultData = (value: unknown): boolean => {
  const serialized = JSON.stringify(value).toLowerCase()
  return [
    "actorid",
    "workspaceid",
    "ledgerid",
    "permission",
    "rawschema",
    "errortag",
    "stack",
    "hosterror",
    "environment",
    "actor_primary_owner",
    "workspace_primary",
    "ledger_primary",
  ].some((token) => serialized.includes(token))
}

export const scoreGeneralLedgerCorpusModeV2 = (
  task: GeneralLedgerCorpusTaskV2,
  candidate: GeneralLedgerCorpusModeCandidateV2,
): GeneralLedgerCorpusModeResultV2 => {
  const expectsPending = task.expectedStatus === "confirmation_required"
  const expectsFailure = task.outcomeClass === "refused_or_invalid"
  const checks = {
    exactStatus: candidate.status === task.expectedStatus,
    exactResult: sameJson(candidate.result, task.expectedResult),
    exactAttempts: sameJson(
      candidate.capabilityAttempts.map(projectAttempt),
      task.expectedAttempts,
    ),
    exactStateDelta:
      candidate.state.eventCountDelta === task.expectedStateDelta,
    exactPendingCount:
      candidate.pendingConfirmationCount === (expectsPending ? 1 : 0),
    immutablePendingBoundary: !expectsPending || candidate.pendingPreviewFrozen,
    noConfirmationControl: !candidate.exposedConfirmationControl,
    failureRedacted: !expectsFailure || !forbiddenResultData(candidate.result),
    boundedResult:
      Buffer.byteLength(JSON.stringify(candidate.result), "utf8") < 64 * 1024,
  }
  const failedInvariants = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  return {
    ...candidate,
    checks,
    failedInvariants,
    passed: failedInvariants.length === 0,
  }
}

export const compareGeneralLedgerCorpusModesV2 = (
  tool: GeneralLedgerCorpusModeResultV2,
  code: GeneralLedgerCorpusModeResultV2,
): GeneralLedgerCorpusComparisonV2 => {
  const checks = {
    sameStatus: tool.status === code.status,
    sameResult: sameJson(tool.result, code.result),
    sameAttempts: sameJson(
      tool.capabilityAttempts.map(projectAttempt),
      code.capabilityAttempts.map(projectAttempt),
    ),
    sameState: sameJson(tool.state, code.state),
    samePendingCount:
      tool.pendingConfirmationCount === code.pendingConfirmationCount,
  }
  const failedInvariants = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  return {
    passed: tool.passed && code.passed && failedInvariants.length === 0,
    checks,
    failedInvariants,
  }
}

const runTaskMode = async (
  task: GeneralLedgerCorpusTaskV2,
  mode: "tool" | "code",
): Promise<GeneralLedgerCorpusModeResultV2> => {
  const gateway = await makeFreshEvaluationGateway(task.runtimeProfile)
  const before = await Effect.runPromise(gateway.invoke("events.query", {}))
  const baselineAttempts = (await Effect.runPromise(gateway.attempts)).length
  const startedAt = performance.now()
  let result: Readonly<Record<string, unknown>> | undefined
  let codeRun: CodeModeRunResult | undefined
  let outerCalls = 0

  if (mode === "tool") {
    const tools = projectGeneralLedgerTools(gateway)
    const outputs: Array<unknown> = []
    for (const [index, call] of task.toolScript.entries()) {
      const tool = tools.find((candidate) => candidate.name === call.toolName)
      if (tool === undefined) {
        throw new GeneralLedgerCorpusEvaluationErrorV2(
          `${task.id} references unavailable tool ${call.toolName}`,
        )
      }
      outerCalls += 1
      try {
        const response = await tool.execute(
          `corpus_${task.id}_${index + 1}`,
          call.arguments,
        )
        const details = asRecord(response.details)
        if (details.status === "succeeded") outputs.push(details.output)
      } catch {
        break
      }
    }
    if (task.outcomeClass === "successful_read") {
      result = projectReadResult(task, outputs)
    }
  } else {
    outerCalls = 1
    try {
      codeRun = await executeCode(task.program, { gateway })
      if (codeRun.status === "completed") result = asRecord(codeRun.output)
    } catch {
      // The authoritative failure is normalized from the gateway attempt below.
    }
  }

  const allAttempts = await Effect.runPromise(gateway.attempts)
  const capabilityAttempts = allAttempts.slice(baselineAttempts)
  const pending = await Effect.runPromise(gateway.pendingConfirmations)
  if (pending.length === 1) result = confirmationResult(pending[0]!)
  if (task.outcomeClass === "refused_or_invalid") {
    result = normalizeFailure(capabilityAttempts.at(-1))
  }
  if (result === undefined) {
    throw new GeneralLedgerCorpusEvaluationErrorV2(
      `${task.id} produced no result`,
    )
  }

  const after = await Effect.runPromise(gateway.invoke("events.query", {}))
  const projectedTools = projectGeneralLedgerTools(gateway)
  const exposedConfirmationControl = [
    ...projectedTools.map((tool) => tool.name),
    ...GENERAL_LEDGER_CODE_MODE_MANIFEST.map((entry) =>
      entry.sdkPath.join("."),
    ),
  ].some((name) => /confirm|approve|reject/.test(name))
  const candidate: GeneralLedgerCorpusModeCandidateV2 = {
    mode,
    status: statusFromResult(result),
    result,
    capabilityAttempts,
    state: {
      eventCountBefore: before.length,
      eventCountAfter: after.length,
      eventCountDelta: after.length - before.length,
    },
    pendingConfirmationCount: pending.length,
    pendingPreviewFrozen: pending.every(
      (request) =>
        Object.isFrozen(request) && Object.isFrozen(request.decodedInput),
    ),
    exposedConfirmationControl,
    metrics: {
      outerCalls,
      innerCapabilityCalls:
        mode === "code"
          ? (codeRun?.capabilityCalls ?? capabilityAttempts.length)
          : capabilityAttempts.length,
      mutationCalls:
        mode === "code"
          ? (codeRun?.mutationCalls ??
            capabilityAttempts.filter((attempt) => attempt.kind === "mutation")
              .length)
          : capabilityAttempts.filter((attempt) => attempt.kind === "mutation")
              .length,
      durationMilliseconds: Number((performance.now() - startedAt).toFixed(3)),
    },
  }
  return scoreGeneralLedgerCorpusModeV2(task, candidate)
}

const emptyStages = (): Record<CapabilityAttemptStage, number> => ({
  lookup: 0,
  input: 0,
  authorization: 0,
  confirmation: 0,
  execution: 0,
  output: 0,
  complete: 0,
})

const totalMetrics = (
  tasks: ReadonlyArray<GeneralLedgerCorpusTaskResultV2>,
  mode: "tool" | "code",
): GeneralLedgerCorpusMetricsV2 =>
  tasks.reduce(
    (total, task) => ({
      outerCalls: total.outerCalls + task.modes[mode].metrics.outerCalls,
      innerCapabilityCalls:
        total.innerCapabilityCalls +
        task.modes[mode].metrics.innerCapabilityCalls,
      mutationCalls:
        total.mutationCalls + task.modes[mode].metrics.mutationCalls,
      durationMilliseconds: Number(
        (
          total.durationMilliseconds +
          task.modes[mode].metrics.durationMilliseconds
        ).toFixed(3),
      ),
    }),
    {
      outerCalls: 0,
      innerCapabilityCalls: 0,
      mutationCalls: 0,
      durationMilliseconds: 0,
    },
  )

export const aggregateGeneralLedgerCorpusV2 = (
  tasks: ReadonlyArray<GeneralLedgerCorpusTaskResultV2>,
): GeneralLedgerCorpusAggregateV2 => {
  const expectedIds = GENERAL_LEDGER_CORPUS_TASKS_V2.map((task) => task.id)
  const actualIds = tasks.map((result) => result.task.id)
  const failedTaskIds = tasks
    .filter((task) => !task.passed)
    .map((task) => task.task.id)
  const failedInvariantNames = tasks.flatMap((result) => [
    ...result.modes.tool.failedInvariants.map(
      (name) => `${result.task.id}:tool.${name}`,
    ),
    ...result.modes.code.failedInvariants.map(
      (name) => `${result.task.id}:code.${name}`,
    ),
    ...result.comparison.failedInvariants.map(
      (name) => `${result.task.id}:comparison.${name}`,
    ),
  ])
  const outcomeClasses = {
    successfulRead: tasks.filter(
      (result) => result.task.outcomeClass === "successful_read",
    ).length,
    confirmationRequired: tasks.filter(
      (result) => result.task.outcomeClass === "confirmation_required",
    ).length,
    refusedOrInvalid: tasks.filter(
      (result) => result.task.outcomeClass === "refused_or_invalid",
    ).length,
  }
  const statuses = {
    completed: tasks.filter(
      (result) => result.task.expectedStatus === "completed",
    ).length,
    confirmationRequired: tasks.filter(
      (result) => result.task.expectedStatus === "confirmation_required",
    ).length,
    refused: tasks.filter((result) => result.task.expectedStatus === "refused")
      .length,
    invalid: tasks.filter((result) => result.task.expectedStatus === "invalid")
      .length,
  }
  const operationCoverage = GENERAL_LEDGER_CORPUS_OPERATION_ORDER_V2.map(
    (name) => ({
      name,
      attemptsPerMode: tasks.reduce(
        (count, result) =>
          count +
          result.task.expectedAttempts.filter(
            (attempt) => attempt.name === name,
          ).length,
        0,
      ),
    }),
  )
  const attemptStageCoverage = tasks.reduce((coverage, result) => {
    for (const attempt of result.task.expectedAttempts)
      coverage[attempt.stage] += 1
    return coverage
  }, emptyStages())
  const modeTotals = {
    tool: totalMetrics(tasks, "tool"),
    code: totalMetrics(tasks, "code"),
  }
  const exactShape =
    sameJson(actualIds, expectedIds) &&
    tasks.length === 20 &&
    outcomeClasses.successfulRead === 10 &&
    outcomeClasses.confirmationRequired === 4 &&
    outcomeClasses.refusedOrInvalid === 6 &&
    statuses.completed === 10 &&
    statuses.confirmationRequired === 4 &&
    statuses.refused === 3 &&
    statuses.invalid === 3 &&
    operationCoverage.every((operation) => operation.attemptsPerMode > 0) &&
    attemptStageCoverage.complete === 16 &&
    attemptStageCoverage.confirmation === 4 &&
    attemptStageCoverage.input === 3 &&
    attemptStageCoverage.authorization === 3 &&
    modeTotals.tool.innerCapabilityCalls === 26 &&
    modeTotals.code.innerCapabilityCalls === 26 &&
    modeTotals.tool.mutationCalls === 7 &&
    modeTotals.code.mutationCalls === 7

  return {
    passed:
      exactShape &&
      failedTaskIds.length === 0 &&
      failedInvariantNames.length === 0,
    taskCount: tasks.length,
    passedTaskCount: tasks.length - failedTaskIds.length,
    failedTaskIds,
    failedInvariantNames,
    outcomeClasses,
    statuses,
    operationCoverage,
    attemptStageCoverage,
    modeTotals,
  }
}

export const assertGeneralLedgerCorpusV2 = (
  summary: GeneralLedgerCorpusSummaryV2,
): void => {
  if (!summary.aggregate.passed) {
    throw new GeneralLedgerCorpusEvaluationErrorV2(
      `General-ledger corpus v2 failed: ${JSON.stringify(summary.aggregate)}`,
    )
  }
}

export const runGeneralLedgerCorpusEvaluationV2 =
  async (): Promise<GeneralLedgerCorpusSummaryV2> => {
    const tasks: Array<GeneralLedgerCorpusTaskResultV2> = []
    for (const task of GENERAL_LEDGER_CORPUS_TASKS_V2) {
      const tool = await runTaskMode(task, "tool")
      const code = await runTaskMode(task, "code")
      const comparison = compareGeneralLedgerCorpusModesV2(tool, code)
      tasks.push({
        task,
        modes: { tool, code },
        comparison,
        passed: tool.passed && code.passed && comparison.passed,
      })
    }
    const summary: GeneralLedgerCorpusSummaryV2 = {
      schemaVersion: 2,
      corpus: {
        id: "general-ledger-conformance-corpus",
        version: 2,
        fixtureVersion: "sample-kernel-v1",
        taskCount: 20,
        sampleSizePerMode: 1,
        runner: "fixed tool projection and controlled code bridge",
      },
      tasks,
      aggregate: aggregateGeneralLedgerCorpusV2(tasks),
      timingNote:
        "Durations are diagnostic only; tool scripts are local and code mode starts a subprocess for each task.",
      conclusion:
        "Twenty deterministic tasks provide conformance evidence for the pinned boundary, not a live-model benchmark or a claim that either mode is generally superior.",
    }
    assertGeneralLedgerCorpusV2(summary)
    return summary
  }
