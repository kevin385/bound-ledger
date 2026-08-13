import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect } from "vitest"

import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
  type CapabilityGatewayService,
} from "@bound/capability"
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
})
