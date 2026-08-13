import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect } from "vitest"

import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
  type CapabilityAttempt,
  type CapabilityGatewayService,
} from "@bound/capability"
import {
  CODE_MODE_DEFAULT_LIMITS,
  LIST_JULY_TRANSACTIONS_PROGRAM,
  type CodeModeRunResult,
} from "@bound/code-mode"
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai"
import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

import { runLedgerAgentPrompt } from "./agent.ts"
import {
  inspectCodeMode,
  projectCodeModeTools,
} from "./code-tools.ts"
import { projectLedgerTools } from "./tools.ts"

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  readableAccountIds: new Set([
    "account_checking",
    "account_credit",
  ]),
  mutableAccountIds: new Set(["account_checking"]),
}

const withSampleGateway = <A, E>(
  use: (gateway: CapabilityGatewayService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const transactions = yield* decodeFixtureTransactions(
      sampleTransactionsFixture,
    )
    const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
    const sessionLayer = makeTrustedSessionLayer(primarySession)
    const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
      Layer.provide(sessionLayer),
    )
    const gatewayLayer = makeCapabilityGatewayLayer().pipe(
      Layer.provide(Layer.merge(ledgerLayer, sessionLayer)),
    )

    return yield* CapabilityGateway.use(use).pipe(
      Effect.provide(gatewayLayer),
    )
  })

const canonicalListAttempt: CapabilityAttempt = {
  name: "transactions.list",
  actorId: "actor_primary_owner",
  kind: "read",
  decodedInput: { month: "2026-07" },
  authorization: "authorized",
  outcome: "succeeded",
  stage: "complete",
}

const finalJulyResponse = (transactions: ReadonlyArray<{ readonly id: string }>) =>
  fauxAssistantMessage(
    fauxText(
      `Found ${transactions.length} July transactions: ${transactions
        .map((transaction) => transaction.id)
        .join(", ")}.`,
    ),
  )

describe("Pi adapter", () => {
  it.effect("projects all ledger capabilities as sequential Pi tools", () =>
    withSampleGateway((gateway) =>
      Effect.gen(function* () {
        const tools = projectLedgerTools(gateway)

        expect(tools.map((tool) => tool.name)).toEqual([
          "transactions_list",
          "transactions_get",
          "transactions_update_category",
        ])
        expect(tools.every((tool) => tool.executionMode === "sequential")).toBe(
          true,
        )

        yield* Effect.promise(async () => {
          const listed = await tools[0]?.execute("call_list", {
            month: "2026-07",
          })
          const found = await tools[1]?.execute("call_get", {
            transactionId: "txn_001",
          })
          const updated = await tools[2]?.execute("call_update", {
            transactionId: "txn_001",
            category: "household",
          })

          expect(listed?.details.capabilityName).toBe("transactions.list")
          expect(found?.details.capabilityName).toBe("transactions.get")
          expect(updated?.details).toMatchObject({
            capabilityName: "transactions.update_category",
            output: { id: "txn_001", category: "household" },
          })
        })

        const attempts = yield* gateway.attempts

        expect(attempts.map((attempt) => attempt.name)).toEqual([
          "transactions.list",
          "transactions.get",
          "transactions.update_category",
        ])
      }),
    ),
  )

  it.effect(
    "lists transactions through Pi Agent Core and the real capability gateway",
    () =>
      withSampleGateway((gateway) =>
        Effect.gen(function* () {
          const faux = fauxProvider({
            provider: "bound-ledger-test",
            tokenSize: { min: 12, max: 12 },
          })
          const models = createModels()

          models.setProvider(faux.provider)
          faux.setResponses([
            fauxAssistantMessage(
              fauxToolCall(
                "transactions_list",
                { month: "2026-07" },
                { id: "call_list_july" },
              ),
              { stopReason: "toolUse" },
            ),
            (context) => {
              const toolResult = context.messages.findLast(
                (message) => message.role === "toolResult",
              )

              if (toolResult?.role !== "toolResult") {
                return fauxAssistantMessage("The transaction tool did not run.", {
                  stopReason: "error",
                  errorMessage: "Missing tool result",
                })
              }

              const text = toolResult.content.find(
                (content) => content.type === "text",
              )?.text
              const transactions = JSON.parse(text ?? "[]") as ReadonlyArray<{
                readonly id: string
              }>

              return fauxAssistantMessage(
                fauxText(
                  `Found ${transactions.length} July transactions: ${transactions
                    .map((transaction) => transaction.id)
                    .join(", ")}.`,
                ),
              )
            },
          ])

          const result = yield* Effect.promise(() =>
            runLedgerAgentPrompt("List my July 2026 transactions.", {
              gateway,
              model: faux.getModel(),
              streamFn: models.streamSimple.bind(models),
            }),
          )
          const attempts = yield* gateway.attempts

          expect(result.text).toBe(
            "Found 3 July transactions: txn_001, txn_002, txn_003.",
          )
          expect(faux.state.callCount).toBe(2)
          expect(faux.getPendingResponseCount()).toBe(0)
          expect(attempts).toEqual([
            {
              name: "transactions.list",
              actorId: "actor_primary_owner",
              kind: "read",
              decodedInput: { month: "2026-07" },
              authorization: "authorized",
              outcome: "succeeded",
              stage: "complete",
            },
          ])
          expect(
            result.events.filter((event) => event.type !== "text_delta"),
          ).toEqual([
            {
              type: "tool_started",
              toolCallId: "call_list_july",
              toolName: "transactions_list",
              args: { month: "2026-07" },
            },
            {
              type: "tool_finished",
              toolCallId: "call_list_july",
              toolName: "transactions_list",
              isError: false,
            },
          ])
          expect(
            result.events
              .filter((event) => event.type === "text_delta")
              .map((event) => event.delta)
              .join(""),
          ).toBe(result.text)
        }),
      ),
  )

  it.effect(
    "projects one bounded code tool with compact authoritative discovery",
    () =>
      withSampleGateway((gateway) =>
        Effect.sync(() => {
          const tools = projectCodeModeTools(gateway)
          const guide = inspectCodeMode(gateway)

          expect(tools).toHaveLength(1)
          expect(tools[0]?.name).toBe("execute_code")
          expect(tools[0]?.executionMode).toBe("sequential")
          expect(guide.capabilities).toEqual([
            {
              name: "transactions.list",
              description: "List readable transactions for a calendar month",
              kind: "read",
              call: 'yield* app.transactions.list({ month: "YYYY-MM" })',
            },
            {
              name: "transactions.get",
              description: "Get one readable transaction by ID",
              kind: "read",
              call: "yield* app.transactions.get({ transactionId })",
            },
            {
              name: "transactions.update_category",
              description: "Update the category of one mutable transaction",
              kind: "mutation",
              call:
                "yield* app.transactions.updateCategory({ transactionId, category })",
            },
          ])
          expect(guide.limits).toBe(CODE_MODE_DEFAULT_LIMITS)
          expect(Object.isFrozen(guide)).toBe(true)
          expect(Object.isFrozen(guide.capabilities)).toBe(true)
        }),
      ),
  )

  it.effect(
    "produces equivalent tool and code results through one Pi loop per mode",
    () =>
      withSampleGateway((toolGateway) =>
        withSampleGateway((codeGateway) =>
          Effect.gen(function* () {
            const toolFaux = fauxProvider({
              provider: "bound-ledger-paired-tool-test",
              tokenSize: { min: 12, max: 12 },
            })
            const codeFaux = fauxProvider({
              provider: "bound-ledger-paired-code-test",
              tokenSize: { min: 12, max: 12 },
            })
            const toolModels = createModels()
            const codeModels = createModels()
            let toolOutput: unknown
            let codeOutput: CodeModeRunResult | undefined
            let codeSystemPrompt = ""
            let codeToolNames: ReadonlyArray<string> = []

            toolModels.setProvider(toolFaux.provider)
            codeModels.setProvider(codeFaux.provider)
            toolFaux.setResponses([
              fauxAssistantMessage(
                fauxToolCall(
                  "transactions_list",
                  { month: "2026-07" },
                  { id: "call_tool_list_july" },
                ),
                { stopReason: "toolUse" },
              ),
              (context) => {
                const result = context.messages.findLast(
                  (message) => message.role === "toolResult",
                )
                const text =
                  result?.role === "toolResult"
                    ? result.content.find((item) => item.type === "text")?.text
                    : undefined
                toolOutput = JSON.parse(text ?? "null")
                return finalJulyResponse(
                  toolOutput as ReadonlyArray<{ readonly id: string }>,
                )
              },
            ])
            codeFaux.setResponses([
              (context) => {
                codeSystemPrompt = context.systemPrompt ?? ""
                codeToolNames = context.tools?.map((tool) => tool.name) ?? []
                return fauxAssistantMessage(
                  fauxToolCall(
                    "execute_code",
                    { program: LIST_JULY_TRANSACTIONS_PROGRAM },
                    { id: "call_code_list_july" },
                  ),
                  { stopReason: "toolUse" },
                )
              },
              (context) => {
                const result = context.messages.findLast(
                  (message) => message.role === "toolResult",
                )
                const text =
                  result?.role === "toolResult"
                    ? result.content.find((item) => item.type === "text")?.text
                    : undefined
                codeOutput = JSON.parse(text ?? "null") as CodeModeRunResult
                return finalJulyResponse(
                  codeOutput.output as ReadonlyArray<{ readonly id: string }>,
                )
              },
            ])

            const toolRun = yield* Effect.promise(() =>
              runLedgerAgentPrompt("List my July 2026 transactions.", {
                gateway: toolGateway,
                model: toolFaux.getModel(),
                streamFn: toolModels.streamSimple.bind(toolModels),
              }),
            )
            const codeRun = yield* Effect.promise(() =>
              runLedgerAgentPrompt("List my July 2026 transactions.", {
                gateway: codeGateway,
                mode: "code",
                systemPrompt: "Custom code assistant.",
                model: codeFaux.getModel(),
                streamFn: codeModels.streamSimple.bind(codeModels),
              }),
            )
            const toolAttempts = yield* toolGateway.attempts
            const codeAttempts = yield* codeGateway.attempts

            expect(codeRun.text).toBe(toolRun.text)
            expect(codeOutput?.output).toEqual(toolOutput)
            expect(codeOutput).toMatchObject({
              capabilityCalls: 1,
              mutationCalls: 0,
            })
            expect(toolAttempts).toEqual([canonicalListAttempt])
            expect(codeAttempts).toEqual(toolAttempts)
            expect(toolFaux.state.callCount).toBe(2)
            expect(codeFaux.state.callCount).toBe(2)
            expect(toolFaux.getPendingResponseCount()).toBe(0)
            expect(codeFaux.getPendingResponseCount()).toBe(0)
            expect(codeToolNames).toEqual(["execute_code"])
            expect(codeSystemPrompt).toContain("Custom code assistant.")
            expect(codeSystemPrompt).toContain("yield* app.transactions.list")
            expect(codeSystemPrompt).toContain('"capabilityCalls":8')
            expect(
              codeRun.events.filter((event) => event.type !== "text_delta"),
            ).toEqual([
              {
                type: "tool_started",
                toolCallId: "call_code_list_july",
                toolName: "execute_code",
                args: { program: LIST_JULY_TRANSACTIONS_PROGRAM },
              },
              {
                type: "tool_finished",
                toolCallId: "call_code_list_july",
                toolName: "execute_code",
                isError: false,
              },
            ])
            expect(
              codeRun.events
                .filter((event) => event.type === "text_delta")
                .map((event) => event.delta)
                .join(""),
            ).toBe(codeRun.text)
          }),
        ),
      ),
  )
})
