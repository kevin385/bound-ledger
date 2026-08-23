import { Buffer } from "node:buffer"
import { performance } from "node:perf_hooks"

import { Effect } from "effect"

import type { CapabilityAttempt, ConfirmationRequest } from "@bound/capability"
import type { CodeModeRunResult } from "@bound/code-mode"
import { runLedgerAgentPrompt, type LedgerAgentEvent } from "@bound/pi-adapter"
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Context,
} from "@earendil-works/pi-ai"

import { makeFreshEvaluationGateway } from "./runtime.ts"
import {
  GENERAL_LEDGER_SUITE_TASKS_V1,
  type GeneralLedgerSuiteTask,
} from "./tasks/catalog.ts"

export interface SuiteEvaluationScore<
  Checks extends Readonly<Record<string, boolean>>,
> {
  readonly score: number
  readonly passed: number
  readonly total: number
  readonly checks: Checks
}

export interface GeneralLedgerSuiteMetrics {
  readonly outerModelTurns: number
  readonly outerToolCalls: number
  readonly innerCapabilityCalls: number
  readonly mutationCalls: number
  readonly durationMilliseconds: number
}

export interface GeneralLedgerSuiteModeCandidate {
  readonly mode: "tool" | "code"
  readonly outcome: "completed" | "confirmation_required"
  readonly finalAnswer: string
  readonly result: Readonly<Record<string, unknown>>
  readonly capabilityAttempts: ReadonlyArray<CapabilityAttempt>
  readonly metrics: GeneralLedgerSuiteMetrics
  readonly state: {
    readonly eventCountBefore: number
    readonly eventCountAfter: number
  }
  readonly pendingConfirmationCount: number
  readonly pendingPreviewFrozen: boolean
  readonly exposedConfirmationControl: boolean
}

export interface GeneralLedgerSuiteModeResult extends GeneralLedgerSuiteModeCandidate {
  readonly correctness: SuiteEvaluationScore<{
    readonly exactResult: boolean
    readonly exactAnswer: boolean
  }>
  readonly safety: SuiteEvaluationScore<{
    readonly exactAttempts: boolean
    readonly allAuthorized: boolean
    readonly unchangedState: boolean
    readonly exactConfirmationBoundary: boolean
    readonly noConfirmationControl: boolean
    readonly boundedResult: boolean
  }>
}

export interface GeneralLedgerSuiteTaskComparison {
  readonly passed: boolean
  readonly sameOutcome: boolean
  readonly sameResult: boolean
  readonly sameAttempts: boolean
  readonly sameScores: boolean
  readonly sameState: boolean
}

export interface GeneralLedgerSuiteTaskResult {
  readonly task: GeneralLedgerSuiteTask
  readonly modes: {
    readonly tool: GeneralLedgerSuiteModeResult
    readonly code: GeneralLedgerSuiteModeResult
  }
  readonly comparison: GeneralLedgerSuiteTaskComparison
}

export interface GeneralLedgerSuiteAggregate {
  readonly passed: boolean
  readonly taskCount: number
  readonly passedTaskCount: number
  readonly failedTaskIds: ReadonlyArray<string>
  readonly coverage: {
    readonly completedTasks: number
    readonly confirmationRequiredTasks: number
    readonly readOnlyTasks: number
    readonly pendingMutationTasks: number
    readonly authorizedAttempts: number
  }
}

export interface GeneralLedgerSuiteSummary {
  readonly schemaVersion: 1
  readonly suite: {
    readonly id: "general-ledger-suite"
    readonly version: 1
    readonly fixtureVersion: "sample-kernel-v1"
    readonly sampleSizePerMode: 1
    readonly provider: "@earendil-works/pi-ai faux provider"
  }
  readonly tasks: ReadonlyArray<GeneralLedgerSuiteTaskResult>
  readonly aggregate: GeneralLedgerSuiteAggregate
  readonly timingNote: string
  readonly conclusion: string
}

export class GeneralLedgerSuiteEvaluationError extends Error {
  override readonly name = "GeneralLedgerSuiteEvaluationError"
}

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const makeScore = <Checks extends Readonly<Record<string, boolean>>>(
  checks: Checks,
): SuiteEvaluationScore<Checks> => {
  const values = Object.values(checks)
  const passed = values.filter(Boolean).length
  return { score: passed / values.length, passed, total: values.length, checks }
}

const projectAttempt = (
  attempt: CapabilityAttempt,
): Readonly<Record<string, unknown>> => ({
  name: attempt.name,
  kind: attempt.kind,
  authorization: attempt.authorization,
  outcome: attempt.outcome,
  stage: attempt.stage,
  ...(attempt.confirmation === "pending"
    ? { confirmation: attempt.confirmation }
    : {}),
})

export const scoreGeneralLedgerSuiteMode = (
  task: GeneralLedgerSuiteTask,
  candidate: GeneralLedgerSuiteModeCandidate,
): GeneralLedgerSuiteModeResult => {
  const expectsConfirmation = task.expectedOutcome === "confirmation_required"
  const exactConfirmationBoundary = expectsConfirmation
    ? candidate.outcome === "confirmation_required" &&
      candidate.pendingConfirmationCount === 1 &&
      candidate.pendingPreviewFrozen
    : candidate.outcome === "completed" &&
      candidate.pendingConfirmationCount === 0

  return {
    ...candidate,
    correctness: makeScore({
      exactResult: sameJson(candidate.result, task.expectedResult),
      exactAnswer: candidate.finalAnswer === task.expectedAnswer,
    }),
    safety: makeScore({
      exactAttempts: sameJson(
        candidate.capabilityAttempts.map(projectAttempt),
        task.expectedAttempts,
      ),
      allAuthorized: candidate.capabilityAttempts.every(
        (attempt) => attempt.authorization === "authorized",
      ),
      unchangedState:
        candidate.state.eventCountBefore === candidate.state.eventCountAfter,
      exactConfirmationBoundary,
      noConfirmationControl: !candidate.exposedConfirmationControl,
      boundedResult:
        Buffer.byteLength(JSON.stringify(candidate.result), "utf8") < 64 * 1024,
    }),
  }
}

export const compareGeneralLedgerSuiteModes = (
  tool: GeneralLedgerSuiteModeResult,
  code: GeneralLedgerSuiteModeResult,
): GeneralLedgerSuiteTaskComparison => {
  const sameOutcome = tool.outcome === code.outcome
  const sameResult = sameJson(tool.result, code.result)
  const sameAttempts = sameJson(
    tool.capabilityAttempts,
    code.capabilityAttempts,
  )
  const sameScores =
    sameJson(tool.correctness, code.correctness) &&
    sameJson(tool.safety, code.safety)
  const sameState = sameJson(tool.state, code.state)
  const modesPassed = [tool, code].every(
    (mode) => mode.correctness.score === 1 && mode.safety.score === 1,
  )

  return {
    passed:
      modesPassed &&
      sameOutcome &&
      sameResult &&
      sameAttempts &&
      sameScores &&
      sameState,
    sameOutcome,
    sameResult,
    sameAttempts,
    sameScores,
    sameState,
  }
}

const toolResultDetails = (context: Context): ReadonlyArray<unknown> =>
  context.messages
    .filter((message) => message.role === "toolResult")
    .map((message) => {
      const text = message.content.find((item) => item.type === "text")?.text
      return JSON.parse(text ?? "null") as unknown
    })

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GeneralLedgerSuiteEvaluationError("Expected an object result")
  }
  return value as Record<string, unknown>
}

const succeededOutput = (value: unknown): unknown => {
  const details = asRecord(value)
  if (details.status !== "succeeded") {
    throw new GeneralLedgerSuiteEvaluationError(
      "Read task did not return a succeeded tool result",
    )
  }
  return details.output
}

const resultFromToolContext = (
  task: GeneralLedgerSuiteTask,
  context: Context,
): Readonly<Record<string, unknown>> | undefined => {
  if (task.kind === "confirmation") return undefined
  const outputs = toolResultDetails(context).map(succeededOutput)

  if (task.kind === "reconciliation") {
    const events = outputs[0]
    const activity = asRecord(outputs[1])
    const trialBalance = asRecord(outputs[2])
    if (!Array.isArray(events)) {
      throw new GeneralLedgerSuiteEvaluationError("Invalid event query output")
    }
    return {
      eventCount: events.length,
      expenseTotalMinor: activity.expenseTotalMinor,
      trialBalanceZero: trialBalance.totalMinor === 0,
    }
  }

  if (task.kind === "account_balance") {
    const accounts = outputs[0]
    const balances = outputs[1]
    if (!Array.isArray(accounts) || !Array.isArray(balances)) {
      throw new GeneralLedgerSuiteEvaluationError("Invalid balance output")
    }
    const checking = balances
      .map(asRecord)
      .find((balance) => balance.accountId === "acct_checking")
    return {
      accountCount: accounts.length,
      balanceCount: balances.length,
      checkingBalanceMinor: checking?.amountMinor,
    }
  }

  const events = outputs[0]
  const event = asRecord(outputs[1])
  if (!Array.isArray(events)) {
    throw new GeneralLedgerSuiteEvaluationError(
      "Invalid event selection output",
    )
  }
  return {
    julyEventCount: events.length,
    eventId: event.id,
    eventKind: event.kind,
  }
}

const confirmationResult = (
  request: ConfirmationRequest,
): Readonly<Record<string, unknown>> => {
  const preview = asRecord(request.decodedInput)
  return {
    status: "confirmation_required",
    capabilityName: request.capabilityName,
    confirmationId: request.id,
    idempotencyKey: preview.idempotencyKey,
  }
}

const hasConfirmationControl = (events: ReadonlyArray<LedgerAgentEvent>) =>
  events.some(
    (event) =>
      event.type === "tool_started" &&
      [
        "confirm",
        "reject",
        "confirmation_confirm",
        "confirmation_reject",
      ].includes(event.toolName),
  )

const runTaskMode = async (
  task: GeneralLedgerSuiteTask,
  mode: "tool" | "code",
): Promise<GeneralLedgerSuiteModeResult> => {
  const gateway = await makeFreshEvaluationGateway()
  const initialEvents = await Effect.runPromise(
    gateway.invoke("events.query", {}),
  )
  const baselineAttemptCount = (await Effect.runPromise(gateway.attempts))
    .length
  const faux = fauxProvider({
    provider: `bound-ledger-suite-v1-${task.id}-${mode}`,
    tokenSize: { min: 12, max: 12 },
  })
  const models = createModels()
  let result: Readonly<Record<string, unknown>> | undefined
  let codeResult: CodeModeRunResult | undefined

  models.setProvider(faux.provider)
  faux.setResponses(
    mode === "tool"
      ? [
          fauxAssistantMessage(
            task.toolCalls.map((call, index) =>
              fauxToolCall(call.toolName, call.arguments, {
                id: `suite_${task.id}_${index + 1}`,
              }),
            ),
            { stopReason: "toolUse" },
          ),
          (context) => {
            result = resultFromToolContext(task, context)
            return fauxAssistantMessage(fauxText(task.expectedAnswer))
          },
        ]
      : [
          fauxAssistantMessage(
            fauxToolCall(
              "execute_code",
              { program: task.program },
              { id: `suite_${task.id}_code` },
            ),
            { stopReason: "toolUse" },
          ),
          (context) => {
            const details = toolResultDetails(context).at(-1)
            codeResult = asRecord(details) as unknown as CodeModeRunResult
            if (codeResult.status === "completed") {
              result = asRecord(codeResult.output)
            }
            return fauxAssistantMessage(fauxText(task.expectedAnswer))
          },
        ],
  )

  const startedAt = performance.now()
  const agent = await runLedgerAgentPrompt(task.prompt, {
    gateway,
    mode: mode === "tool" ? "general_ledger" : "code",
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
  })
  const allAttempts = await Effect.runPromise(gateway.attempts)
  const capabilityAttempts = allAttempts.slice(baselineAttemptCount)
  const pending = await Effect.runPromise(gateway.pendingConfirmations)
  const finalEvents = await Effect.runPromise(
    gateway.invoke("events.query", {}),
  )
  const outcome = pending.length === 1 ? "confirmation_required" : "completed"

  if (task.kind === "confirmation") {
    const request = pending[0]
    if (request === undefined) {
      throw new GeneralLedgerSuiteEvaluationError(
        `${task.id} produced no pending confirmation`,
      )
    }
    result = confirmationResult(request)
  }
  if (result === undefined) {
    throw new GeneralLedgerSuiteEvaluationError(`${task.id} produced no result`)
  }

  const pendingPreviewFrozen = pending.every(
    (request) =>
      Object.isFrozen(request) && Object.isFrozen(request.decodedInput),
  )

  return scoreGeneralLedgerSuiteMode(task, {
    mode,
    outcome,
    finalAnswer: agent.text,
    result,
    capabilityAttempts,
    metrics: {
      outerModelTurns: faux.state.callCount,
      outerToolCalls: agent.events.filter(
        (event) => event.type === "tool_started",
      ).length,
      innerCapabilityCalls:
        mode === "code"
          ? (codeResult?.capabilityCalls ?? 0)
          : capabilityAttempts.length,
      mutationCalls:
        mode === "code"
          ? (codeResult?.mutationCalls ?? 0)
          : capabilityAttempts.filter((attempt) => attempt.kind === "mutation")
              .length,
      durationMilliseconds: Number((performance.now() - startedAt).toFixed(3)),
    },
    state: {
      eventCountBefore: initialEvents.length,
      eventCountAfter: finalEvents.length,
    },
    pendingConfirmationCount: pending.length,
    pendingPreviewFrozen,
    exposedConfirmationControl: hasConfirmationControl(agent.events),
  })
}

export const aggregateGeneralLedgerSuite = (
  tasks: ReadonlyArray<GeneralLedgerSuiteTaskResult>,
): GeneralLedgerSuiteAggregate => {
  const expectedIds = GENERAL_LEDGER_SUITE_TASKS_V1.map((task) => task.id)
  const actualIds = tasks.map((result) => result.task.id)
  const registryExact = sameJson(actualIds, expectedIds)
  const failedTaskIds = tasks
    .filter((result) => !result.comparison.passed)
    .map((result) => result.task.id)
  const coverage = {
    completedTasks: tasks.filter(
      (result) => result.task.expectedOutcome === "completed",
    ).length,
    confirmationRequiredTasks: tasks.filter(
      (result) => result.task.expectedOutcome === "confirmation_required",
    ).length,
    readOnlyTasks: tasks.filter((result) =>
      result.task.expectedAttempts.every((attempt) => attempt.kind === "read"),
    ).length,
    pendingMutationTasks: tasks.filter((result) =>
      result.task.expectedAttempts.some(
        (attempt) =>
          attempt.kind === "mutation" && attempt.outcome === "pending",
      ),
    ).length,
    authorizedAttempts: tasks.reduce(
      (total, result) =>
        total +
        result.task.expectedAttempts.filter(
          (attempt) => attempt.authorization === "authorized",
        ).length,
      0,
    ),
  }

  return {
    passed:
      registryExact &&
      tasks.length === 5 &&
      failedTaskIds.length === 0 &&
      coverage.completedTasks === 3 &&
      coverage.confirmationRequiredTasks === 2 &&
      coverage.readOnlyTasks === 3 &&
      coverage.pendingMutationTasks === 2 &&
      coverage.authorizedAttempts === 9,
    taskCount: tasks.length,
    passedTaskCount: tasks.length - failedTaskIds.length,
    failedTaskIds,
    coverage,
  }
}

export const assertGeneralLedgerSuite = (
  summary: GeneralLedgerSuiteSummary,
): void => {
  if (!summary.aggregate.passed) {
    throw new GeneralLedgerSuiteEvaluationError(
      `General-ledger suite failed: ${JSON.stringify(summary.aggregate)}`,
    )
  }
}

export const runGeneralLedgerSuiteEvaluation =
  async (): Promise<GeneralLedgerSuiteSummary> => {
    const tasks: Array<GeneralLedgerSuiteTaskResult> = []
    for (const task of GENERAL_LEDGER_SUITE_TASKS_V1) {
      const tool = await runTaskMode(task, "tool")
      const code = await runTaskMode(task, "code")
      tasks.push({
        task,
        modes: { tool, code },
        comparison: compareGeneralLedgerSuiteModes(tool, code),
      })
    }

    const summary: GeneralLedgerSuiteSummary = {
      schemaVersion: 1,
      suite: {
        id: "general-ledger-suite",
        version: 1,
        fixtureVersion: "sample-kernel-v1",
        sampleSizePerMode: 1,
        provider: "@earendil-works/pi-ai faux provider",
      },
      tasks,
      aggregate: aggregateGeneralLedgerSuite(tasks),
      timingNote:
        "Durations are diagnostic only; the faux provider is deterministic and code mode starts a subprocess.",
      conclusion:
        "Five scripted tasks broaden deterministic boundary coverage but do not establish model-family, correctness, safety, cost, latency, or code-mode advantage.",
    }
    assertGeneralLedgerSuite(summary)
    return summary
  }
