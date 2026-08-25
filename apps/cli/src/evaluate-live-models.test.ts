import assert from "node:assert/strict"
import test from "node:test"

import { executeCode } from "@bound/code-mode"
import { GENERAL_LEDGER_CORPUS_TASKS_V2 } from "@bound/evaluation"
import { projectGeneralLedgerTools } from "@bound/pi-adapter"
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Usage,
} from "@earendil-works/pi-ai"

import {
  LIVE_MODEL_PILOT_TASK_IDS,
  LIVE_MODEL_PILOT_TASKS,
  LIVE_MODEL_PILOT_TRIALS,
  aggregateLiveModelTrials,
  makeLiveModelDryRun,
  normalizeProviderFailure,
  runLiveModelPilot,
  runLiveModelCommand,
  runLiveModelTrial,
  type LiveAgentRunner,
  type LiveModelTrial,
  type LiveProviderRuntime,
} from "./evaluate-live-models.ts"
import {
  decodeModelConfigurationMatrixV1,
  type ModelConfigurationV1,
} from "./model-configuration.ts"

const usage: Usage = {
  input: 10,
  output: 5,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 15,
  cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
}

const configuration: ModelConfigurationV1 = {
  id: "scripted-local",
  provider: "scripted",
  model: "fixture-model",
  endpointKind: "local",
  supportsTools: true,
  supportsCodeMode: true,
  baseUrlEnvironmentVariable: "BOUND_LEDGER_MODEL_BASE_URL",
}

const provider: LiveProviderRuntime = {
  model: {
    id: "fixture-model",
    name: "fixture-model",
    api: "faux",
    provider: "scripted",
    baseUrl: "http://127.0.0.1:1/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 10_000,
    maxTokens: 1_000,
  },
  streamFn: (() => {
    throw new Error("network_must_not_be_called")
  }) as LiveProviderRuntime["streamFn"],
}

const scriptedRunner: LiveAgentRunner = async ({ task, mode, gateway }) => {
  const events = []
  if (mode === "tool") {
    const tools = projectGeneralLedgerTools(gateway)
    for (const [index, call] of task.toolScript.entries()) {
      const tool = tools.find(({ name }) => name === call.toolName)
      assert.ok(tool)
      events.push({
        type: "tool_started" as const,
        toolCallId: `scripted-${index}`,
        toolName: call.toolName,
        args: {},
      })
      try {
        await tool.execute(`scripted-${index}`, call.arguments)
      } catch {
        break
      }
      events.push({
        type: "tool_finished" as const,
        toolCallId: `scripted-${index}`,
        toolName: call.toolName,
        isError: false,
      })
    }
  } else {
    events.push({
      type: "tool_started" as const,
      toolCallId: "scripted-code",
      toolName: "execute_code",
      args: {},
    })
    try {
      await executeCode(task.program, { gateway })
    } catch {
      // Expected confirmation and refusal boundaries are scored from attempts.
    }
  }
  return {
    text: JSON.stringify(task.expectedResult),
    events,
    modelTurns: 2,
    usage,
  }
}

const matrix = () =>
  decodeModelConfigurationMatrixV1({
    schemaVersion: 1,
    configurations: [configuration],
  })

test("pilot registry is the exact immutable six-task v2 subset by reference", () => {
  assert.deepEqual(LIVE_MODEL_PILOT_TASK_IDS, [
    "general-ledger-reconciliation",
    "event-detail-selection",
    "august-close-composition",
    "expense-post-confirmation",
    "closed-input-authority-injection",
    "unknown-event-reversal",
  ])
  for (const task of LIVE_MODEL_PILOT_TASKS) {
    assert.equal(
      task,
      GENERAL_LEDGER_CORPUS_TASKS_V2.find(({ id }) => id === task.id),
    )
    assert.ok(Object.isFrozen(task))
  }
  assert.equal(LIVE_MODEL_PILOT_TRIALS, 3)
})

test("scripted provider covers successful tool and code calls through v2 scoring", async () => {
  const task = LIVE_MODEL_PILOT_TASKS[0]!
  const tool = await runLiveModelTrial({
    configuration,
    provider,
    task,
    mode: "tool",
    trial: 1,
    applicationRevision: "test-revision",
    runAgent: scriptedRunner,
  })
  const code = await runLiveModelTrial({
    configuration,
    provider,
    task,
    mode: "code",
    trial: 1,
    applicationRevision: "test-revision",
    runAgent: scriptedRunner,
  })
  assert.equal(tool.passed, true)
  assert.equal(code.passed, true)
  assert.equal(tool.innerCapabilityCalls, 3)
  assert.equal(code.outerCalls, 1)
  assert.equal(tool.inputTokens, 10)
  assert.equal(tool.estimatedCost, 0.03)
})

test("Pi faux streams execute real tool and code agent loops without disclosure", async () => {
  const task = LIVE_MODEL_PILOT_TASKS[0]!
  const secret = "stream-secret-value"
  const endpoint = "https://private.example.test/v1"

  const toolFaux = fauxProvider({ tokensPerSecond: 100_000 })
  let toolContext = ""
  toolFaux.setResponses([
    fauxAssistantMessage(
      task.toolScript.map((call, index) =>
        fauxToolCall(call.toolName, call.arguments, {
          id: `live-tool-${index}`,
        }),
      ),
      { stopReason: "toolUse" },
    ),
    (context) => {
      toolContext = JSON.stringify(context)
      return fauxAssistantMessage(fauxText(JSON.stringify(task.expectedResult)))
    },
  ])
  const toolRuntime: LiveProviderRuntime = {
    model: { ...toolFaux.getModel(), baseUrl: endpoint },
    streamFn: toolFaux.provider.streamSimple.bind(toolFaux.provider),
  }
  const tool = await runLiveModelTrial({
    configuration,
    provider: toolRuntime,
    task,
    mode: "tool",
    trial: 1,
    applicationRevision: "test-revision",
  })
  assert.equal(tool.passed, true)
  assert.equal(tool.outerCalls, 3)
  assert.ok(!JSON.stringify(tool).includes(endpoint))
  assert.ok(!toolContext.includes(endpoint))
  assert.ok(!toolContext.includes(secret))

  const codeFaux = fauxProvider({ tokensPerSecond: 100_000 })
  codeFaux.setResponses([
    fauxAssistantMessage(
      fauxToolCall("execute_code", { program: task.program }, { id: "live-code" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(fauxText(JSON.stringify(task.expectedResult))),
  ])
  const code = await runLiveModelTrial({
    configuration,
    provider: {
      model: codeFaux.getModel(),
      streamFn: codeFaux.provider.streamSimple.bind(codeFaux.provider),
    },
    task,
    mode: "code",
    trial: 1,
    applicationRevision: "test-revision",
  })
  assert.equal(code.passed, true)
  assert.equal(code.outerCalls, 1)
})

test("Pi faux stream failures normalize without leaking raw provider data", async () => {
  const secret = "provider-secret-in-error"
  const faux = fauxProvider()
  faux.setResponses([
    fauxAssistantMessage([], {
      stopReason: "error",
      errorMessage: `stream socket closed ${secret}`,
    }),
  ])
  const result = await runLiveModelTrial({
    configuration,
    provider: {
      model: faux.getModel(),
      streamFn: faux.provider.streamSimple.bind(faux.provider),
    },
    task: LIVE_MODEL_PILOT_TASKS[0]!,
    mode: "tool",
    trial: 1,
    applicationRevision: "test-revision",
  })
  assert.equal(result.providerFailure, "streaming_failed")
  assert.ok(!JSON.stringify(result).includes(secret))
})

test("scripted confirmation, invalid input, and refusal remain authoritative", async () => {
  for (const taskId of [
    "expense-post-confirmation",
    "closed-input-authority-injection",
    "unknown-event-reversal",
  ]) {
    const task = LIVE_MODEL_PILOT_TASKS.find(({ id }) => id === taskId)!
    const result = await runLiveModelTrial({
      configuration,
      provider,
      task,
      mode: "tool",
      trial: 1,
      applicationRevision: "test-revision",
      runAgent: scriptedRunner,
    })
    assert.equal(result.passed, true, `${taskId}: ${result.failedInvariants}`)
  }
})

test("normalizes cancellation, malformed, unavailable tool, stream, rate, and provider failures", () => {
  assert.equal(normalizeProviderFailure(new DOMException("cancel", "AbortError")), "cancelled")
  assert.equal(normalizeProviderFailure(new Error("invalid JSON output")), "malformed_output")
  assert.equal(normalizeProviderFailure(new Error("tool not found")), "unavailable_tool")
  assert.equal(normalizeProviderFailure(new Error("stream socket closed")), "streaming_failed")
  assert.equal(normalizeProviderFailure(new Error("HTTP 429")), "rate_limited")
  assert.equal(normalizeProviderFailure({ structured: true }), "provider_unavailable")
})

test("malformed output and missing usage are visible without raw provider errors", async () => {
  const task = LIVE_MODEL_PILOT_TASKS[0]!
  const malformed = await runLiveModelTrial({
    configuration,
    provider,
    task,
    mode: "tool",
    trial: 1,
    applicationRevision: "test-revision",
    runAgent: async (input) => ({
      ...(await scriptedRunner(input)),
      text: "not-json",
    }),
  })
  assert.equal(malformed.providerFailure, "malformed_output")
  assert.equal(malformed.status, "provider_failed")

  const missingUsage = await runLiveModelTrial({
    configuration,
    provider,
    task,
    mode: "tool",
    trial: 1,
    applicationRevision: "test-revision",
    runAgent: async (input) => ({
      ...(await scriptedRunner(input)),
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    }),
  })
  assert.equal(missingUsage.passed, true)
  assert.equal(missingUsage.providerFailure, "usage_unavailable")
})

test("opt-in and endpoint policy fail before provider construction", async () => {
  let providerConstructions = 0
  const createProvider = () => {
    providerConstructions += 1
    return provider
  }
  await assert.rejects(
    runLiveModelPilot({
      matrix: matrix(),
      environment: { BOUND_LEDGER_MODEL_BASE_URL: "http://127.0.0.1:1/v1" },
      createProvider,
      runAgent: scriptedRunner,
    }),
    /live_evaluation_not_enabled/,
  )
  assert.equal(providerConstructions, 0)

  const remote = decodeModelConfigurationMatrixV1({
    schemaVersion: 1,
    configurations: [
      {
        ...configuration,
        endpointKind: "openai_compatible",
        apiKeyEnvironmentVariable: "BOUND_LEDGER_MODEL_API_KEY",
      },
    ],
  })
  await assert.rejects(
    runLiveModelPilot({
      matrix: remote,
      environment: {
        BOUND_LEDGER_LIVE_EVAL: "1",
        BOUND_LEDGER_MODEL_BASE_URL: "http://remote.example.test/v1",
        BOUND_LEDGER_MODEL_API_KEY: "secret",
      },
      createProvider,
      runAgent: scriptedRunner,
    }),
    /endpoint_policy_rejected/,
  )
  assert.equal(providerConstructions, 0)
})

test("dry run needs no opt-in, endpoint resolution, provider, or network", () => {
  const dryRun = makeLiveModelDryRun(matrix())
  assert.equal(dryRun.networkAccess, false)
  assert.equal(dryRun.providerConstruction, false)
  assert.deepEqual(dryRun.configurations[0]?.modes, ["tool", "code"])
  assert.deepEqual(dryRun.taskIds, LIVE_MODEL_PILOT_TASK_IDS)
})

test("documented pnpm separator and root-relative config path produce a dry run", async () => {
  const result = await runLiveModelCommand(
    [
      "--",
      "--config",
      "evals/configs/live-model-matrix.example.json",
      "--dry-run",
    ],
    { INIT_CWD: new URL("../../..", import.meta.url).pathname },
  )
  assert.ok("dryRun" in result)
  assert.equal(result.dryRun, true)
})

test("three fresh trials per task expose one failed trial in aggregates", async () => {
  let calls = 0
  const sometimesFails: LiveAgentRunner = async (input) => {
    calls += 1
    if (calls === 2) throw new DOMException("cancelled", "AbortError")
    return scriptedRunner(input)
  }
  const summary = await runLiveModelPilot({
    matrix: matrix(),
    environment: {
      BOUND_LEDGER_LIVE_EVAL: "1",
      BOUND_LEDGER_MODEL_BASE_URL: "http://localhost:1/v1",
    },
    applicationRevision: "test-revision",
    createProvider: () => provider,
    runAgent: sometimesFails,
  })
  const tool = summary.configurations[0]!.modes.find(({ mode }) => mode === "tool")!
  assert.equal(tool.status, "evaluated")
  assert.equal(tool.trials.length, LIVE_MODEL_PILOT_TASKS.length * 3)
  assert.equal(tool.tasks[0]!.sampleSize, 3)
  assert.equal(tool.tasks[0]!.passCount, 2)
  assert.ok(tool.tasks[0]!.observedFailures.includes("cancelled"))
  assert.ok(
    tool.trials
      .filter(({ status }) => status !== "provider_failed")
      .every(({ state }) => state.eventCountBefore === 10),
  )
})

test("unsupported modes are explicit and secrets and URLs stay out of summaries", async () => {
  const toolOnly = decodeModelConfigurationMatrixV1({
    schemaVersion: 1,
    configurations: [{ ...configuration, supportsCodeMode: false }],
  })
  const secret = "live-eval-secret-value"
  const url = "http://localhost:1/v1"
  const summary = await runLiveModelPilot({
    matrix: toolOnly,
    environment: {
      BOUND_LEDGER_LIVE_EVAL: "1",
      BOUND_LEDGER_MODEL_BASE_URL: url,
      BOUND_LEDGER_MODEL_API_KEY: secret,
    },
    createProvider: () => provider,
    runAgent: scriptedRunner,
  })
  const serialized = JSON.stringify(summary)
  assert.equal(summary.configurations[0]!.modes[1]!.status, "unsupported")
  assert.ok(!serialized.includes(secret))
  assert.ok(!serialized.includes(url))
  assert.ok(!serialized.includes("actor_primary_owner"))
  assert.ok(!serialized.includes("ledger_primary"))
})

test("aggregate publishes sample size, pass rate, median, range, and failures", () => {
  const trials = [
    { passed: true, durationMilliseconds: 1, failedInvariants: [] },
    { passed: false, durationMilliseconds: 9, failedInvariants: ["exactResult"] },
    { passed: true, durationMilliseconds: 5, failedInvariants: [] },
  ] as unknown as ReadonlyArray<LiveModelTrial>
  assert.deepEqual(aggregateLiveModelTrials("task", trials), {
    taskId: "task",
    sampleSize: 3,
    passCount: 2,
    passRate: 0.6667,
    durationMilliseconds: { median: 5, range: [1, 9] },
    observedFailures: ["exactResult"],
  })
})
