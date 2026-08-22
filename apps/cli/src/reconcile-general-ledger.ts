import { Console, Effect, Layer } from "effect"

import {
  CapabilityGateway,
  generalLedgerCapabilities,
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
  decodeKernelFixture,
  makeInMemoryLedgerKernelLayer,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleKernelFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

const primaryAccountIds = [
  "acct_checking",
  "acct_cash",
  "acct_receivable",
  "acct_investment",
  "acct_credit",
  "acct_loan",
  "acct_equity",
  "acct_income",
  "acct_groceries",
  "acct_utilities",
] as const

const session: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  activeLedgerId: "ledger_primary",
  readableAccountIds: new Set(primaryAccountIds),
  mutableAccountIds: new Set(primaryAccountIds),
}

const prompt =
  "Reconcile July 2026. Report the posted event count, expense total in minor units, and whether the trial balance is zero at the start of August."

const julyRange = {
  from: "2026-07-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
}

interface SuccessfulToolResult {
  readonly capabilityName: string
  readonly output: unknown
}

const program = Effect.gen(function* () {
  const transactions = yield* decodeFixtureTransactions(
    sampleTransactionsFixture,
  )
  const legacyAccounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
  const fixture = yield* decodeKernelFixture(sampleKernelFixture)
  const sessionLayer = makeTrustedSessionLayer(session)
  const legacyLayer = makeInMemoryLedgerLayer(
    transactions,
    legacyAccounts,
  ).pipe(Layer.provide(sessionLayer))
  const kernelLayer = makeInMemoryLedgerKernelLayer({
    currency: fixture.currency,
    accounts: fixture.accounts,
    events: fixture.events,
    proposals: fixture.proposals,
  }).pipe(Layer.provide(sessionLayer))
  const runtimeLayer = Layer.merge(
    Layer.merge(legacyLayer, kernelLayer),
    sessionLayer,
  )
  const gatewayLayer = makeCapabilityGatewayLayer(
    generalLedgerCapabilities,
  ).pipe(Layer.provide(runtimeLayer))

  const result = yield* CapabilityGateway.use((gateway) =>
    Effect.gen(function* () {
      const faux = fauxProvider({
        provider: "bound-ledger-general-ledger-cli",
        tokenSize: { min: 12, max: 12 },
      })
      const models = createModels()

      models.setProvider(faux.provider)
      faux.setResponses([
        fauxAssistantMessage(
          [
            fauxToolCall("events_query", julyRange, {
              id: "call_july_events",
            }),
            fauxToolCall("reports_activity", julyRange, {
              id: "call_july_activity",
            }),
            fauxToolCall(
              "reports_trial_balance",
              { at: julyRange.to },
              { id: "call_august_trial_balance" },
            ),
          ],
          { stopReason: "toolUse" },
        ),
        (context) => {
          const results = context.messages
            .filter((message) => message.role === "toolResult")
            .map((message) => {
              const text = message.content.find(
                (content) => content.type === "text",
              )?.text
              return JSON.parse(text ?? "null") as SuccessfulToolResult
            })
          const outputByCapability = new Map(
            results.map((toolResult) => [
              toolResult.capabilityName,
              toolResult.output,
            ]),
          )
          const events = outputByCapability.get(
            "events.query",
          ) as ReadonlyArray<unknown>
          const activity = outputByCapability.get("reports.activity") as {
            readonly expenseTotalMinor: number
          }
          const trialBalance = outputByCapability.get(
            "reports.trial_balance",
          ) as { readonly totalMinor: number }

          return fauxAssistantMessage(
            fauxText(
              `July 2026 reconciled: ${events.length} posted events, ${activity.expenseTotalMinor} expense minor units, trial balance zero: ${trialBalance.totalMinor === 0 ? "yes" : "no"}.`,
            ),
          )
        },
      ])

      const agent = yield* Effect.promise(() =>
        runLedgerAgentPrompt(prompt, {
          gateway,
          mode: "general_ledger",
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
  ).pipe(Effect.provide(gatewayLayer))

  yield* Console.log(JSON.stringify(result, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
