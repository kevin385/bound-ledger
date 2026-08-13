import { Console, Effect, Layer } from "effect"

import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
} from "@bound/capability"
import { runLedgerAgentPrompt } from "@bound/pi-adapter"
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

const session: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  readableAccountIds: new Set([
    "account_checking",
    "account_credit",
  ]),
  mutableAccountIds: new Set(["account_checking"]),
}

const prompt = "List my July 2026 transactions."

const program = Effect.gen(function* () {
  const transactions = yield* decodeFixtureTransactions(
    sampleTransactionsFixture,
  )
  const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
  const sessionLayer = makeTrustedSessionLayer(session)
  const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
    Layer.provide(sessionLayer),
  )
  const capabilityLayer = makeCapabilityGatewayLayer().pipe(
    Layer.provide(Layer.merge(ledgerLayer, sessionLayer)),
  )
  const result = yield* CapabilityGateway.use((gateway) =>
    Effect.gen(function* () {
      const faux = fauxProvider({
        provider: "bound-ledger-cli",
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
          const text =
            toolResult?.role === "toolResult"
              ? toolResult.content.find((content) => content.type === "text")
                  ?.text
              : undefined
          const visibleTransactions = JSON.parse(text ?? "[]") as ReadonlyArray<{
            readonly id: string
            readonly merchant: string
            readonly amountCents: number
          }>

          return fauxAssistantMessage(
            fauxText(
              `Found ${visibleTransactions.length} July transactions: ${visibleTransactions
                .map(
                  (transaction) =>
                    `${transaction.id} (${transaction.merchant}, ${transaction.amountCents} cents)`,
                )
                .join(", ")}.`,
            ),
          )
        },
      ])

      const agent = yield* Effect.promise(() =>
        runLedgerAgentPrompt(prompt, {
          gateway,
          model: faux.getModel(),
          streamFn: models.streamSimple.bind(models),
        }),
      )

      return {
        prompt,
        assistant: agent.text,
        agentEvents: agent.events,
        capabilityAttempts: yield* gateway.attempts,
      }
    }),
  ).pipe(
    Effect.provide(capabilityLayer),
  )

  yield* Console.log(JSON.stringify(result, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
